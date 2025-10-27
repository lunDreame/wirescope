use anyhow::{anyhow, Result};
use once_cell::sync::Lazy;
use serialport::{self, DataBits, FlowControl, Parity, SerialPortType, StopBits};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::AppHandle;
use tauri::Emitter;
use tauri::Manager;
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use std::fs::{OpenOptions, File};

pub fn list_ports() -> Result<Vec<String>> {
  let ports = serialport::available_ports()?;
  Ok(ports
    .into_iter()
    .map(|p| match p.port_type {
      SerialPortType::UsbPort(info) => format!(
        "{} (USB: {} {} {}:{})",
        p.port_name,
        info.manufacturer.unwrap_or_default(),
        info.product.unwrap_or_default(),
        info.vid,
        info.pid
      ),
      _ => p.port_name,
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

fn default_conn_id() -> String { "main".to_string() }

fn to_data_bits(n: u8) -> Result<DataBits> { match n {5=>Ok(DataBits::Five),6=>Ok(DataBits::Six),7=>Ok(DataBits::Seven),8=>Ok(DataBits::Eight), _=>Err(anyhow!("invalid databits"))} }
fn to_parity(s: &str) -> Result<Parity> { match s {"none"=>Ok(Parity::None),"even"=>Ok(Parity::Even),"odd"=>Ok(Parity::Odd), _=>Err(anyhow!("invalid parity"))} }
fn to_stop_bits(n: u8) -> Result<StopBits> { match n {1=>Ok(StopBits::One),2=>Ok(StopBits::Two), _=>Err(anyhow!("invalid stopbits"))} }
fn to_flow(s: &str) -> Result<FlowControl> { match s {"none"=>Ok(FlowControl::None),"software"=>Ok(FlowControl::Software),"hardware"=>Ok(FlowControl::Hardware), _=>Err(anyhow!("invalid flow"))} }

fn create_rolling_log_file(app: &AppHandle, origin: &str, conn_id: &str) -> Result<File> {
  let log_dir = app.path().app_log_dir()
    .map_err(|e| anyhow::anyhow!("Failed to get log directory: {}", e))?;
  std::fs::create_dir_all(&log_dir)?;
  
  let timestamp = OffsetDateTime::now_utc();
  let filename = format!("{}_{}_{:04}{:02}{:02}_{:02}{:02}{:02}.log",
    origin, conn_id,
    timestamp.year(), timestamp.month() as u8, timestamp.day(),
    timestamp.hour(), timestamp.minute(), timestamp.second()
  );
  
  let path = log_dir.join(filename);
  let file = OpenOptions::new()
    .create(true)
    .append(true)
    .open(path)?;
  
  Ok(file)
}

struct SerialHandle { tx: crossbeam_channel::Sender<Vec<u8>>, _join: thread::JoinHandle<()> }

static SERIAL_STATE: Lazy<Arc<Mutex<HashMap<String, SerialHandle>>>> = Lazy::new(|| Arc::new(Mutex::new(HashMap::new())));

pub async fn open_and_spawn(app: AppHandle, args: SerialOpenArgs) -> Result<()> {
  let conn_id = args.conn_id.clone();
  
  // 기존 연결 종료
  {
    let mut state = SERIAL_STATE.lock().unwrap();
    state.remove(&conn_id);
  }

  let builder = serialport::new(args.port.clone(), args.baud)
    .data_bits(to_data_bits(args.data_bits)?)
    .parity(to_parity(&args.parity)?)
    .stop_bits(to_stop_bits(args.stop_bits)?)
    .flow_control(to_flow(&args.flow)?)
    .timeout(Duration::from_millis(100));

  let mut port = builder.open()?;
  let (tx_s, tx_r) = crossbeam_channel::unbounded::<Vec<u8>>();

  let conn_id_clone = conn_id.clone();
  let log_file = create_rolling_log_file(&app, "serial", &conn_id)?;

  let join = thread::spawn(move || {
    let mut buf = [0u8; 4096];
    let mut last = Instant::now();
    let mut log_file = log_file;

    let emit = |dir: &str, data: Vec<u8>, last: &mut Instant, log_file: &mut File| {
      let when = OffsetDateTime::now_local().unwrap_or_else(|_| OffsetDateTime::now_utc());
      let when_str = when.format(&Rfc3339).unwrap();
      let interval = last.elapsed().as_millis();
      
      let _ = app.emit("log", serde_json::json!({
        "when_iso": &when_str,
        "interval_ms": interval,
        "dir": dir,
        "origin": "serial",
        "text": String::from_utf8_lossy(&data).to_string(),
        "raw": data,
        "connId": &conn_id_clone,
      }));

      // 로그 파일에 기록
      let _ = writeln!(log_file, "[{}] ({}) {} | {}", 
        when_str, dir, interval, String::from_utf8_lossy(&data));
      
      *last = Instant::now();
    };

    loop {
      if let Ok(p) = tx_r.try_recv() {
        let _ = port.write_all(&p);
        emit("TX", p, &mut last, &mut log_file);
      }
      match port.read(&mut buf) {
        Ok(n) if n > 0 => emit("RX", buf[..n].to_vec(), &mut last, &mut log_file),
        _ => thread::sleep(Duration::from_millis(5)),
      }
    }
  });

  SERIAL_STATE.lock().unwrap().insert(conn_id, SerialHandle { tx: tx_s, _join: join });
  Ok(())
}

pub fn close(conn_id: Option<String>) -> Result<()> {
  let mut g = SERIAL_STATE.lock().unwrap();
  if let Some(id) = conn_id {
    g.remove(&id);
  } else {
    g.clear();
  }
  Ok(())
}

pub fn tx(payload: String, append: String, conn_id: String) -> Result<()> {
  let bytes = match append.as_str() {
    "lf" => [payload.as_bytes(), b"\n"].concat(),
    "cr" => [payload.as_bytes(), b"\r"].concat(),
    "crlf" => [payload.as_bytes(), b"\r\n"].concat(),
    _ => payload.into_bytes(),
  };
  let state = SERIAL_STATE.lock().unwrap();
  if let Some(h) = state.get(&conn_id) { 
    h.tx.send(bytes)?; 
  }
  Ok(())
}
