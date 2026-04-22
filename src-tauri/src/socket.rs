use tokio::net::TcpStream;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::mpsc::{self, UnboundedSender, UnboundedReceiver};

pub struct SocketConnection {
    pub tx: UnboundedSender<Vec<u8>>,
}

pub async fn connect_tcp(
    host: String,
    port: u16,
    on_data: impl Fn(Vec<u8>) + Send + 'static,
) -> Result<SocketConnection, String> {
    // Retry on EINTR (macOS os error 4 — connect() interrupted by signal)
    let stream = loop {
        match TcpStream::connect(format!("{host}:{port}")).await {
            Ok(s) => break Ok(s),
            Err(e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(e) => break Err(e.to_string()),
        }
    }?;

    let (mut reader, mut writer) = tokio::io::split(stream);
    let (tx, mut rx): (UnboundedSender<Vec<u8>>, UnboundedReceiver<Vec<u8>>) = mpsc::unbounded_channel();

    tokio::spawn(async move {
        let mut buf = vec![0u8; 4096];
        loop {
            match reader.read(&mut buf).await {
                Ok(0) | Err(_) => break,
                Ok(n) => on_data(buf[..n].to_vec()),
            }
        }
    });

    tokio::spawn(async move {
        while let Some(data) = rx.recv().await {
            if writer.write_all(&data).await.is_err() {
                break;
            }
        }
    });

    Ok(SocketConnection { tx })
}
