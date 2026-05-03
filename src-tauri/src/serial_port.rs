use serialport::SerialPort;
use std::time::Duration;
use tokio::sync::mpsc::{self, UnboundedSender, UnboundedReceiver};
use tokio::task;

pub fn list_ports() -> Vec<String> {
    serialport::available_ports()
        .unwrap_or_default()
        .into_iter()
        .map(|p| p.port_name)
        .collect()
}

pub struct SerialConnection {
    pub tx: UnboundedSender<Vec<u8>>,
}

pub fn open(
    port_name: String,
    baud_rate: u32,
    on_data: impl Fn(Vec<u8>) + Send + 'static,
) -> Result<SerialConnection, String> {
    let port = serialport::new(&port_name, baud_rate)
        .timeout(Duration::from_millis(10))
        .open()
        .map_err(|e| e.to_string())?;

    let (tx, rx): (UnboundedSender<Vec<u8>>, UnboundedReceiver<Vec<u8>>) = mpsc::unbounded_channel();

    let port_clone = port.try_clone().map_err(|e| e.to_string())?;

    task::spawn_blocking(move || read_loop(port_clone, on_data));
    task::spawn_blocking(move || write_loop(port, rx));

    Ok(SerialConnection { tx })
}

fn read_loop(mut port: Box<dyn SerialPort>, on_data: impl Fn(Vec<u8>)) {
    let mut buf = [0u8; 4096];
    loop {
        match port.read(&mut buf) {
            Ok(n) if n > 0 => on_data(buf[..n].to_vec()),
            Ok(_) => {}
            Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => {}
            Err(ref e) if e.kind() == std::io::ErrorKind::Interrupted => {}
            Err(_) => break,
        }
    }
}

fn write_loop(mut port: Box<dyn SerialPort>, mut rx: UnboundedReceiver<Vec<u8>>) {
    while let Some(data) = rx.blocking_recv() {
        if port.write_all(&data).is_err() {
            break;
        }
    }
}
