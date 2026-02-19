use anyhow::{anyhow, Result};
use once_cell::sync::Lazy;
use serialport::{self, DataBits, FlowControl, Parity, SerialPortType, StopBits};
use std::collections::HashMap;
use std::io::{ErrorKind, Read, Write};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::AppHandle;

use crate::payload::apply_append_mode;
use crate::telemetry::TelemetryLogger;

pub fn list_ports() -> Result<Vec<String>> {
    let ports = serialport::available_ports()?;

    Ok(ports
        .into_iter()
        .map(|port| match port.port_type {
            SerialPortType::UsbPort(info) => format!(
                "{} (USB: {} {} {}:{})",
                port.port_name,
                info.manufacturer.unwrap_or_default(),
                info.product.unwrap_or_default(),
                info.vid,
                info.pid
            ),
            _ => port.port_name,
        })
        .collect())
}

#[derive(serde::Deserialize)]
pub struct SerialOpenArgs {
    pub port: String,
    pub baud: u32,
    pub data_bits: u8,
    pub parity: String,
    pub stop_bits: u8,
    pub flow: String,
    #[serde(default = "default_conn_id")]
    pub conn_id: String,
}

fn default_conn_id() -> String {
    String::from("main")
}

struct SerialHandle {
    tx_sender: crossbeam_channel::Sender<Vec<u8>>,
    stop_sender: crossbeam_channel::Sender<()>,
    join_handle: thread::JoinHandle<()>,
}

static SERIAL_STATE: Lazy<Arc<Mutex<HashMap<String, SerialHandle>>>> =
    Lazy::new(|| Arc::new(Mutex::new(HashMap::new())));

const SERIAL_IO_TIMEOUT_MS: u64 = 100;
const TX_QUEUE_CAPACITY: usize = 1024;
const MAX_TX_BATCH_PER_TICK: usize = 64;

pub async fn open_and_spawn(app: AppHandle, args: SerialOpenArgs) -> Result<()> {
    cleanup_finished_handles();

    let conn_id = args.conn_id.clone();

    if let Some(existing) = take_handle(&conn_id) {
        shutdown_handle(existing);
    }

    let builder = serialport::new(args.port.clone(), args.baud)
        .data_bits(to_data_bits(args.data_bits)?)
        .parity(to_parity(&args.parity)?)
        .stop_bits(to_stop_bits(args.stop_bits)?)
        .flow_control(to_flow(&args.flow)?)
        .timeout(Duration::from_millis(SERIAL_IO_TIMEOUT_MS));

    let mut port = builder.open()?;

    let (tx_sender, tx_receiver) = crossbeam_channel::bounded::<Vec<u8>>(TX_QUEUE_CAPACITY);
    let (stop_sender, stop_receiver) = crossbeam_channel::bounded::<()>(1);
    let conn_id_for_thread = conn_id.clone();

    let join_handle = thread::spawn(move || {
        let mut logger = match TelemetryLogger::new(app, "serial", &conn_id_for_thread) {
            Ok(instance) => instance,
            Err(error) => {
                eprintln!("failed to initialize serial logger: {error}");
                return;
            }
        };

        let mut buffer = [0u8; 4096];

        loop {
            if stop_receiver.try_recv().is_ok() {
                break;
            }

            for _ in 0..MAX_TX_BATCH_PER_TICK {
                match tx_receiver.try_recv() {
                    Ok(payload) => match port.write_all(&payload) {
                        Ok(_) => logger.emit("TX", &payload),
                        Err(error) => {
                            logger.emit_text("SYS", &format!("[ERROR] serial write: {error}"));
                            return;
                        }
                    },
                    Err(crossbeam_channel::TryRecvError::Empty) => break,
                    Err(crossbeam_channel::TryRecvError::Disconnected) => return,
                }
            }

            match port.read(&mut buffer) {
                Ok(read) if read > 0 => logger.emit("RX", &buffer[..read]),
                Err(error) if error.kind() == ErrorKind::TimedOut => {}
                Err(error) => {
                    logger.emit_text("SYS", &format!("[ERROR] serial read: {error}"));
                    return;
                }
                _ => {}
            }
        }

        logger.emit_text("SYS", "[INFO] serial worker stopped");
    });

    SERIAL_STATE.lock().unwrap().insert(
        conn_id,
        SerialHandle {
            tx_sender,
            stop_sender,
            join_handle,
        },
    );

    Ok(())
}

pub fn close(conn_id: Option<String>) -> Result<()> {
    cleanup_finished_handles();

    let handles: Vec<SerialHandle> = {
        let mut state = SERIAL_STATE.lock().unwrap();

        if let Some(id) = conn_id {
            state.remove(&id).into_iter().collect()
        } else {
            state.drain().map(|(_, handle)| handle).collect()
        }
    };

    handles.into_iter().for_each(shutdown_handle);

    Ok(())
}

pub fn tx(payload: String, append: String, conn_id: String) -> Result<()> {
    let bytes = apply_append_mode(payload, &append);

    let sender = {
        let state = SERIAL_STATE.lock().unwrap();
        let handle = state
            .get(&conn_id)
            .ok_or_else(|| anyhow!("serial connection not found: {conn_id}"))?;

        handle.tx_sender.clone()
    };

    sender
        .try_send(bytes)
        .map_err(|error| anyhow!("serial tx queue is full or closed: {error}"))?;
    Ok(())
}

pub fn is_connected(conn_id: &str) -> bool {
    cleanup_finished_handles();
    let state = SERIAL_STATE.lock().unwrap();
    state.contains_key(conn_id)
}

fn shutdown_handle(handle: SerialHandle) {
    let _ = handle.stop_sender.send(());
    let _ = handle.join_handle.join();
}

fn take_handle(conn_id: &str) -> Option<SerialHandle> {
    SERIAL_STATE.lock().unwrap().remove(conn_id)
}

fn cleanup_finished_handles() {
    let handles: Vec<SerialHandle> = {
        let mut state = SERIAL_STATE.lock().unwrap();
        let finished_ids: Vec<String> = state
            .iter()
            .filter_map(|(conn_id, handle)| {
                if handle.join_handle.is_finished() {
                    Some(conn_id.clone())
                } else {
                    None
                }
            })
            .collect();

        finished_ids
            .into_iter()
            .filter_map(|conn_id| state.remove(&conn_id))
            .collect()
    };

    handles.into_iter().for_each(shutdown_handle);
}

fn to_data_bits(bits: u8) -> Result<DataBits> {
    match bits {
        5 => Ok(DataBits::Five),
        6 => Ok(DataBits::Six),
        7 => Ok(DataBits::Seven),
        8 => Ok(DataBits::Eight),
        _ => Err(anyhow!("invalid data bits: {bits}")),
    }
}

fn to_parity(parity: &str) -> Result<Parity> {
    match parity {
        "none" => Ok(Parity::None),
        "even" => Ok(Parity::Even),
        "odd" => Ok(Parity::Odd),
        _ => Err(anyhow!("invalid parity: {parity}")),
    }
}

fn to_stop_bits(stop_bits: u8) -> Result<StopBits> {
    match stop_bits {
        1 => Ok(StopBits::One),
        2 => Ok(StopBits::Two),
        _ => Err(anyhow!("invalid stop bits: {stop_bits}")),
    }
}

fn to_flow(flow: &str) -> Result<FlowControl> {
    match flow {
        "none" => Ok(FlowControl::None),
        "software" => Ok(FlowControl::Software),
        "hardware" => Ok(FlowControl::Hardware),
        _ => Err(anyhow!("invalid flow control: {flow}")),
    }
}
