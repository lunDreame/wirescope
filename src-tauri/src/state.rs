use std::collections::HashMap;
use std::sync::Arc;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Packet {
    pub id: u64,
    pub timestamp_ms: f64,
    pub gap_ms: Option<f64>,
    pub direction: String, // "TX" | "RX"
    pub bytes: Vec<u8>,
    pub checksum_ok: Option<bool>,
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SplitterConfig {
    pub method: String,              // "delimiter" | "length_field" | "gap"
    pub sof: Vec<u8>,
    pub eof: Vec<u8>,
    pub eof_include: bool,
    pub gap_ms: f64,
    pub length_field_offset: usize,
    pub length_field_size: usize,
    pub length_includes_header: bool,
    pub checksum_algorithm: String,
    pub checksum_offset: i32,
    pub checksum_size: usize,
    #[serde(default)]
    pub checksum_exclude_sof: bool,
}

impl Default for SplitterConfig {
    fn default() -> Self {
        Self {
            method: "delimiter".into(),
            sof: vec![0xAA, 0x55],
            eof: vec![],
            eof_include: true,
            gap_ms: 5.0,
            length_field_offset: 2,
            length_field_size: 2,
            length_includes_header: false,
            checksum_algorithm: "none".into(),
            checksum_offset: -2,
            checksum_size: 2,
            checksum_exclude_sof: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimingStats {
    pub total_packets: u64,
    pub total_bytes: u64,
    pub avg_gap_ms: f64,
    pub min_gap_ms: f64,
    pub max_gap_ms: f64,
    pub std_gap_ms: f64,
    pub cycle_count: u64,
    pub avg_cycle_ms: f64,
    pub avg_idle_ms: f64,
    pub checksum_pass: u64,
    pub checksum_fail: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionInfo {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub connected: bool,
    pub tx_bytes: u64,
    pub rx_bytes: u64,
}

/// Per-session splitter state persisted between data callbacks.
pub struct SessionSplitterState {
    pub buf: Vec<u8>,
    pub in_packet: bool,
}

impl Default for SessionSplitterState {
    fn default() -> Self { Self { buf: Vec::new(), in_packet: false } }
}

pub struct AppState {
    pub sessions: HashMap<String, SessionInfo>,
    pub packets: Vec<Packet>,
    pub splitter: SplitterConfig,
    pub splitter_states: HashMap<String, SessionSplitterState>,
    pub next_id: u64,
    pub serial_tx: Option<tokio::sync::mpsc::UnboundedSender<Vec<u8>>>,
    pub socket_tx: Option<tokio::sync::mpsc::UnboundedSender<Vec<u8>>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            sessions: HashMap::new(),
            packets: Vec::new(),
            splitter: SplitterConfig::default(),
            splitter_states: HashMap::new(),
            next_id: 1,
            serial_tx: None,
            socket_tx: None,
        }
    }
}

pub type SharedState = Arc<Mutex<AppState>>;

pub fn new_state() -> SharedState {
    Arc::new(Mutex::new(AppState::default()))
}

pub fn now_ms() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs_f64()
        * 1000.0
}
