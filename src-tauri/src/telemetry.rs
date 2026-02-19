use anyhow::{anyhow, Result};
use std::fs::{File, OpenOptions};
use std::io::Write;
use std::time::Instant;
use tauri::AppHandle;
use tauri::Emitter;
use tauri::Manager;
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

pub struct TelemetryLogger {
    app: AppHandle,
    origin: &'static str,
    conn_id: String,
    last: Instant,
    file: File,
}

impl TelemetryLogger {
    pub fn new(app: AppHandle, origin: &'static str, conn_id: &str) -> Result<Self> {
        let file = create_rolling_log_file(&app, origin, conn_id)?;

        Ok(Self {
            app,
            origin,
            conn_id: conn_id.to_string(),
            last: Instant::now(),
            file,
        })
    }

    pub fn emit(&mut self, dir: &str, payload: &[u8]) {
        let when = OffsetDateTime::now_local().unwrap_or_else(|_| OffsetDateTime::now_utc());
        let when_str = when
            .format(&Rfc3339)
            .unwrap_or_else(|_| String::from("1970-01-01T00:00:00Z"));
        let interval_ms = self.last.elapsed().as_millis();

        let bytes = payload.to_vec();
        let text = String::from_utf8_lossy(payload).to_string();

        let _ = self.app.emit(
            "log",
            serde_json::json!({
              "when_iso": when_str,
              "interval_ms": interval_ms,
              "dir": dir,
              "origin": self.origin,
              "text": text,
              "raw": bytes,
              "connId": self.conn_id,
            }),
        );

        let _ = writeln!(
            self.file,
            "[{}] ({}) {} | {}",
            when_str,
            dir,
            interval_ms,
            String::from_utf8_lossy(payload)
        );

        self.last = Instant::now();
    }

    pub fn emit_text(&mut self, dir: &str, text: &str) {
        let when = OffsetDateTime::now_local().unwrap_or_else(|_| OffsetDateTime::now_utc());
        let when_str = when
            .format(&Rfc3339)
            .unwrap_or_else(|_| String::from("1970-01-01T00:00:00Z"));
        let interval_ms = self.last.elapsed().as_millis();

        let _ = writeln!(self.file, "[{}] ({}) {} | {}", when_str, dir, interval_ms, text);

        self.last = Instant::now();
    }
}

fn create_rolling_log_file(app: &AppHandle, origin: &str, conn_id: &str) -> Result<File> {
    let log_dir = app
        .path()
        .app_log_dir()
        .map_err(|error| anyhow!("failed to resolve app log dir: {error}"))?;

    std::fs::create_dir_all(&log_dir)?;

    let now = OffsetDateTime::now_utc();
    let filename = format!(
        "{}_{}_{:04}{:02}{:02}_{:02}{:02}{:02}.log",
        origin,
        conn_id,
        now.year(),
        now.month() as u8,
        now.day(),
        now.hour(),
        now.minute(),
        now.second(),
    );

    let path = log_dir.join(filename);

    let file = OpenOptions::new().create(true).append(true).open(path)?;

    Ok(file)
}
