use anyhow::{anyhow, Result};
use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::io::{ErrorKind, Read, Write};
use std::net::{TcpStream, UdpSocket};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::AppHandle;

use crate::payload::apply_append_mode;
use crate::telemetry::TelemetryLogger;

struct SocketHandle {
    tx_sender: crossbeam_channel::Sender<Vec<u8>>,
    stop_sender: crossbeam_channel::Sender<()>,
    join_handle: thread::JoinHandle<()>,
}

static SOCKET_STATE: Lazy<Arc<Mutex<HashMap<String, SocketHandle>>>> =
    Lazy::new(|| Arc::new(Mutex::new(HashMap::new())));

const SOCKET_IO_TIMEOUT_MS: u64 = 100;
const TX_QUEUE_CAPACITY: usize = 1024;
const MAX_TX_BATCH_PER_TICK: usize = 64;

#[derive(serde::Deserialize)]
pub struct SocketOpenArgs {
    pub host: String,
    pub port: u16,
    pub proto: String,
    #[serde(default = "default_conn_id")]
    pub conn_id: String,
}

fn default_conn_id() -> String {
    String::from("main")
}

pub async fn open_and_spawn(app: AppHandle, args: SocketOpenArgs) -> Result<()> {
    cleanup_finished_handles();

    let conn_id = args.conn_id.clone();

    if let Some(existing) = take_handle(&conn_id) {
        shutdown_handle(existing);
    }

    let proto = args.proto.to_lowercase();
    let host = args.host.clone();
    let port = args.port;
    let conn_id_for_thread = conn_id.clone();

    let (tx_sender, tx_receiver) = crossbeam_channel::bounded::<Vec<u8>>(TX_QUEUE_CAPACITY);
    let (stop_sender, stop_receiver) = crossbeam_channel::bounded::<()>(1);

    let join_handle = if proto == "tcp" {
        let address = format!("{host}:{port}");
        let stream = TcpStream::connect(&address)?;
        let _ = stream.set_nodelay(true);
        let _ = stream.set_read_timeout(Some(Duration::from_millis(SOCKET_IO_TIMEOUT_MS)));

        thread::spawn(move || {
            let mut logger = match TelemetryLogger::new(app, "socket", &conn_id_for_thread) {
                Ok(instance) => instance,
                Err(error) => {
                    eprintln!("failed to initialize socket logger: {error}");
                    return;
                }
            };

            run_tcp_loop(stream, tx_receiver, stop_receiver, &mut logger);
            logger.emit_text("SYS", "[INFO] socket worker stopped");
        })
    } else if proto == "udp" {
        thread::spawn(move || {
            let mut logger = match TelemetryLogger::new(app, "socket", &conn_id_for_thread) {
                Ok(instance) => instance,
                Err(error) => {
                    eprintln!("failed to initialize socket logger: {error}");
                    return;
                }
            };

            run_udp_loop(&host, port, tx_receiver, stop_receiver, &mut logger);
            logger.emit_text("SYS", "[INFO] socket worker stopped");
        })
    } else {
        return Err(anyhow!("unsupported protocol: {}", args.proto));
    };

    SOCKET_STATE.lock().unwrap().insert(
        conn_id,
        SocketHandle {
            tx_sender,
            stop_sender,
            join_handle,
        },
    );

    Ok(())
}

pub fn close(conn_id: Option<String>) -> Result<()> {
    cleanup_finished_handles();

    let handles: Vec<SocketHandle> = {
        let mut state = SOCKET_STATE.lock().unwrap();

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
        let state = SOCKET_STATE.lock().unwrap();
        let handle = state
            .get(&conn_id)
            .ok_or_else(|| anyhow!("socket connection not found: {conn_id}"))?;

        handle.tx_sender.clone()
    };

    sender
        .try_send(bytes)
        .map_err(|error| anyhow!("socket tx queue is full or closed: {error}"))?;
    Ok(())
}

pub fn is_connected(conn_id: &str) -> bool {
    cleanup_finished_handles();
    let state = SOCKET_STATE.lock().unwrap();
    state.contains_key(conn_id)
}

fn run_tcp_loop(
    mut stream: TcpStream,
    tx_receiver: crossbeam_channel::Receiver<Vec<u8>>,
    stop_receiver: crossbeam_channel::Receiver<()>,
    logger: &mut TelemetryLogger,
) {
    let mut buffer = [0u8; 4096];

    loop {
        if stop_receiver.try_recv().is_ok() {
            break;
        }

        for _ in 0..MAX_TX_BATCH_PER_TICK {
            match tx_receiver.try_recv() {
                Ok(payload) => match stream.write_all(&payload) {
                    Ok(_) => logger.emit("TX", &payload),
                    Err(error) => {
                        logger.emit_text("SYS", &format!("[ERROR] TCP write: {error}"));
                        return;
                    }
                },
                Err(crossbeam_channel::TryRecvError::Empty) => break,
                Err(crossbeam_channel::TryRecvError::Disconnected) => return,
            }
        }

        match stream.read(&mut buffer) {
            Ok(read) if read > 0 => logger.emit("RX", &buffer[..read]),
            Ok(_) => {
                logger.emit_text("SYS", "[INFO] TCP peer closed connection");
                return;
            }
            Err(error)
                if error.kind() == ErrorKind::TimedOut || error.kind() == ErrorKind::WouldBlock => {
            }
            Err(error) => {
                logger.emit_text("SYS", &format!("[ERROR] TCP read: {error}"));
                return;
            }
        }
    }
}

fn run_udp_loop(
    host: &str,
    port: u16,
    tx_receiver: crossbeam_channel::Receiver<Vec<u8>>,
    stop_receiver: crossbeam_channel::Receiver<()>,
    logger: &mut TelemetryLogger,
) {
    let peer = format!("{host}:{port}");

    let socket = match UdpSocket::bind("0.0.0.0:0") {
        Ok(socket) => socket,
        Err(error) => {
            logger.emit_text("SYS", &format!("[ERROR] UDP bind failed: {error}"));
            return;
        }
    };

    let _ = socket.set_read_timeout(Some(Duration::from_millis(SOCKET_IO_TIMEOUT_MS)));

    let mut buffer = [0u8; 4096];

    loop {
        if stop_receiver.try_recv().is_ok() {
            break;
        }

        for _ in 0..MAX_TX_BATCH_PER_TICK {
            match tx_receiver.try_recv() {
                Ok(payload) => match socket.send_to(&payload, &peer) {
                    Ok(_) => logger.emit("TX", &payload),
                    Err(error) => logger.emit_text("SYS", &format!("[ERROR] UDP send: {error}")),
                },
                Err(crossbeam_channel::TryRecvError::Empty) => break,
                Err(crossbeam_channel::TryRecvError::Disconnected) => return,
            }
        }

        match socket.recv(&mut buffer) {
            Ok(read) if read > 0 => logger.emit("RX", &buffer[..read]),
            Ok(_) => {}
            Err(error)
                if error.kind() == ErrorKind::TimedOut || error.kind() == ErrorKind::WouldBlock => {
            }
            Err(error) => {
                logger.emit_text("SYS", &format!("[ERROR] UDP read: {error}"));
                return;
            }
        }
    }
}

fn shutdown_handle(handle: SocketHandle) {
    let _ = handle.stop_sender.send(());
    let _ = handle.join_handle.join();
}

fn take_handle(conn_id: &str) -> Option<SocketHandle> {
    SOCKET_STATE.lock().unwrap().remove(conn_id)
}

fn cleanup_finished_handles() {
    let handles: Vec<SocketHandle> = {
        let mut state = SOCKET_STATE.lock().unwrap();
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
