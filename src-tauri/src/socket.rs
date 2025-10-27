use anyhow::Result;
use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpStream, UdpSocket};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::AppHandle;
use tauri::Emitter;
use tauri::Manager;
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use std::fs::{OpenOptions, File};

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

struct SocketHandle { tx: crossbeam_channel::Sender<Vec<u8>>, _join: thread::JoinHandle<()> }
static SOCKET_STATE: Lazy<Arc<Mutex<HashMap<String, SocketHandle>>>> = Lazy::new(|| Arc::new(Mutex::new(HashMap::new())));

#[derive(serde::Deserialize)]
pub struct SocketOpenArgs { 
  pub host: String, 
  pub port: u16, 
  pub proto: String,
  #[serde(default = "default_conn_id")]
  pub conn_id: String,
}

fn default_conn_id() -> String { "main".to_string() }

pub async fn open_and_spawn(app: AppHandle, args: SocketOpenArgs) -> Result<()> {
  let conn_id = args.conn_id.clone();
  
  // 기존 연결 종료
  {
    let mut state = SOCKET_STATE.lock().unwrap();
    state.remove(&conn_id);
  }

  let (tx_s, tx_r) = crossbeam_channel::unbounded::<Vec<u8>>();

  let is_tcp = args.proto.to_lowercase() == "tcp";
  let host = args.host.clone();
  let port = args.port;
  let conn_id_clone = conn_id.clone();
  let log_file = create_rolling_log_file(&app, "socket", &conn_id)?;

  let join = thread::spawn(move || {
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
        "origin": "socket",
        "text": String::from_utf8_lossy(&data).to_string(),
        "raw": data,
        "connId": &conn_id_clone,
      }));

      // 로그 파일에 기록
      let _ = writeln!(log_file, "[{}] ({}) {} | {}", 
        when_str, dir, interval, String::from_utf8_lossy(&data));
      
      *last = Instant::now();
    };

    if is_tcp {
      let addr = format!("{}:{}", host, port);
      let mut stream = match TcpStream::connect(&addr) {
        Ok(s) => s,
        Err(e) => { emit("SYS", format!("[ERROR] TCP connect {addr}: {e}").into_bytes(), &mut last, &mut log_file); return; }
      };
      
      // TCP keep-alive 설정으로 연결 유지
      let _ = stream.set_read_timeout(Some(Duration::from_millis(100)));
      let _ = stream.set_nodelay(true); // Nagle 알고리즘 비활성화로 지연 최소화
      
      #[cfg(unix)]
      {
        use std::os::unix::io::AsRawFd;
        unsafe {
          let fd = stream.as_raw_fd();
          let optval: libc::c_int = 1;
          libc::setsockopt(fd, libc::SOL_SOCKET, libc::SO_KEEPALIVE, 
            &optval as *const _ as *const libc::c_void, 
            std::mem::size_of_val(&optval) as libc::socklen_t);
        }
      }
      
      let mut buf = [0u8; 4096];
      loop {
        if let Ok(p) = tx_r.try_recv() { let _ = stream.write_all(&p); emit("TX", p, &mut last, &mut log_file); }
        match stream.read(&mut buf) { Ok(n) if n>0 => emit("RX", buf[..n].to_vec(), &mut last, &mut log_file), _ => thread::sleep(Duration::from_millis(5)) }
      }
    } else {
      let local = "0.0.0.0:0";
      let peer = format!("{}:{}", host, port);
      let sock = match UdpSocket::bind(local) {
        Ok(s) => s,
        Err(e) => { emit("SYS", format!("[ERROR] UDP bind {local}: {e}").into_bytes(), &mut last, &mut log_file); return; }
      };
      let _ = sock.set_read_timeout(Some(Duration::from_millis(100)));
      let mut buf = [0u8; 4096];
      loop {
        if let Ok(p) = tx_r.try_recv() { let _ = sock.send_to(&p, &peer); emit("TX", p, &mut last, &mut log_file); }
        match sock.recv(&mut buf) { Ok(n) if n>0 => emit("RX", buf[..n].to_vec(), &mut last, &mut log_file), _ => thread::sleep(Duration::from_millis(5)) }
      }
    }
  });

  SOCKET_STATE.lock().unwrap().insert(conn_id, SocketHandle { tx: tx_s, _join: join });
  Ok(())
}

pub fn close(conn_id: Option<String>) -> Result<()> { 
  let mut g = SOCKET_STATE.lock().unwrap(); 
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
  let state = SOCKET_STATE.lock().unwrap();
  if let Some(h) = state.get(&conn_id) { 
    h.tx.send(bytes)?; 
  }
  Ok(())
}
