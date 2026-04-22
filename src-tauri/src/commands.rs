use tauri::{AppHandle, Emitter, State};
use tauri_plugin_dialog::DialogExt;
use crate::state::{SharedState, SplitterConfig, TimingStats, SessionInfo, now_ms};
use crate::checksum::{self, ChecksumResult};
use crate::splitter::Splitter;
use crate::{serial_port, socket};
use std::sync::Arc;

#[tauri::command]
pub fn list_serial_ports() -> Vec<String> {
    serial_port::list_ports()
}

#[tauri::command]
pub async fn connect_serial(
    app: AppHandle,
    state: State<'_, SharedState>,
    port: String,
    baud: u32,
) -> Result<String, String> {
    let state_arc = Arc::clone(&state);
    let app2 = app.clone();
    let session_id = port.clone();

    let conn = serial_port::open(port.clone(), baud, move |data| {
        let mut st = state_arc.lock();
        let ts = now_ms();
        let prev_ts = st.packets.last().map(|p| p.timestamp_ms);

        // Swap out the persisted splitter state so we don't recreate it every call
        let ss = st.splitter_states.remove(&session_id).unwrap_or_default();
        let mut splitter = Splitter::with_state(st.splitter.clone(), ss.buf, ss.in_packet);
        let mut pkts = splitter.feed(&data, "RX", ts, &session_id, &mut st.next_id);
        let (buf, in_packet) = splitter.into_state();
        st.splitter_states.insert(session_id.clone(), crate::state::SessionSplitterState { buf, in_packet });

        for pkt in &mut pkts {
            pkt.gap_ms = prev_ts.map(|pt| ts - pt);
            if let Some(sess) = st.sessions.get_mut(&session_id) {
                sess.rx_bytes += pkt.bytes.len() as u64;
            }
            st.packets.push(pkt.clone());
            let _ = app2.emit("packet", pkt.clone());
        }
    })?;

    let mut st = state.lock();
    st.serial_tx = Some(conn.tx);
    st.sessions.insert(port.clone(), SessionInfo {
        id: port.clone(),
        name: port.clone(),
        kind: "serial".into(),
        connected: true,
        tx_bytes: 0,
        rx_bytes: 0,
    });
    Ok(port)
}

#[tauri::command]
pub async fn connect_tcp(
    app: AppHandle,
    state: State<'_, SharedState>,
    host: String,
    port: u16,
) -> Result<String, String> {
    let state_arc = Arc::clone(&state);
    let app2 = app.clone();
    let session_id = format!("{host}:{port}");
    let sid2 = session_id.clone();

    let conn = socket::connect_tcp(host.clone(), port, move |data| {
        let mut st = state_arc.lock();
        let ts = now_ms();
        let prev_ts = st.packets.last().map(|p| p.timestamp_ms);

        let ss = st.splitter_states.remove(&sid2).unwrap_or_default();
        let mut splitter = Splitter::with_state(st.splitter.clone(), ss.buf, ss.in_packet);
        let mut pkts = splitter.feed(&data, "RX", ts, &sid2, &mut st.next_id);
        let (buf, in_packet) = splitter.into_state();
        st.splitter_states.insert(sid2.clone(), crate::state::SessionSplitterState { buf, in_packet });

        for pkt in &mut pkts {
            pkt.gap_ms = prev_ts.map(|pt| ts - pt);
            if let Some(sess) = st.sessions.get_mut(&sid2) {
                sess.rx_bytes += pkt.bytes.len() as u64;
            }
            st.packets.push(pkt.clone());
            let _ = app2.emit("packet", pkt.clone());
        }
    }).await?;

    let mut st = state.lock();
    st.socket_tx = Some(conn.tx);
    st.sessions.insert(session_id.clone(), SessionInfo {
        id: session_id.clone(),
        name: session_id.clone(),
        kind: "tcp".into(),
        connected: true,
        tx_bytes: 0,
        rx_bytes: 0,
    });
    Ok(session_id)
}

#[tauri::command]
pub fn disconnect(state: State<'_, SharedState>, session_id: String) {
    let mut st = state.lock();
    if let Some(sess) = st.sessions.get_mut(&session_id) {
        sess.connected = false;
    }
    st.serial_tx = None;
    st.socket_tx = None;
}

#[tauri::command]
pub fn send_bytes(state: State<'_, SharedState>, app: AppHandle, hex: String, session_id: String) -> Result<(), String> {
    let bytes = hex_to_bytes(&hex)?;
    let ts = now_ms();
    let mut st = state.lock();
    let prev_ts = st.packets.last().map(|p| p.timestamp_ms);

    if let Some(tx) = &st.serial_tx {
        tx.send(bytes.clone()).map_err(|e| e.to_string())?;
    } else if let Some(tx) = &st.socket_tx {
        tx.send(bytes.clone()).map_err(|e| e.to_string())?;
    } else {
        return Err("Not connected".into());
    }

    let id = st.next_id;
    st.next_id += 1;
    let pkt = crate::state::Packet {
        id,
        timestamp_ms: ts,
        gap_ms: prev_ts.map(|pt| ts - pt),
        direction: "TX".into(),
        bytes: bytes.clone(),
        checksum_ok: None,
        session_id: session_id.clone(),
    };
    if let Some(sess) = st.sessions.get_mut(&session_id) {
        sess.tx_bytes += bytes.len() as u64;
    }
    st.packets.push(pkt.clone());
    let _ = app.emit("packet", &pkt);
    Ok(())
}

#[tauri::command]
pub fn get_packets(state: State<'_, SharedState>) -> Vec<crate::state::Packet> {
    state.lock().packets.clone()
}

#[tauri::command]
pub fn clear_packets(state: State<'_, SharedState>) {
    state.lock().packets.clear();
}

#[tauri::command]
pub fn get_sessions(state: State<'_, SharedState>) -> Vec<SessionInfo> {
    state.lock().sessions.values().cloned().collect()
}

#[tauri::command]
pub fn set_splitter(state: State<'_, SharedState>, config: SplitterConfig) {
    let mut st = state.lock();
    st.splitter = config;
    st.splitter_states.clear(); // reset per-session buffers on config change
}

#[tauri::command]
pub fn get_splitter(state: State<'_, SharedState>) -> SplitterConfig {
    state.lock().splitter.clone()
}

#[tauri::command]
pub fn compute_checksum(algo: String, hex: String) -> Result<ChecksumResult, String> {
    let data = hex_to_bytes(&hex)?;
    let v = checksum::compute(&algo, &data);
    let width = match algo.as_str() {
        "crc32" => 8,
        "sum8" | "xor" => 2,
        _ => 4,
    };
    Ok(ChecksumResult {
        algorithm: algo,
        value: v,
        hex: format!("{v:0>width$X}"),
    })
}

#[tauri::command]
pub fn compute_all_checksums(hex: String) -> Result<Vec<ChecksumResult>, String> {
    let data = hex_to_bytes(&hex)?;
    Ok(checksum::compute_all(&data))
}

#[tauri::command]
pub fn get_timing_stats(state: State<'_, SharedState>) -> TimingStats {
    let st = state.lock();
    let packets = &st.packets;
    let total_packets = packets.len() as u64;
    let total_bytes: u64 = packets.iter().map(|p| p.bytes.len() as u64).sum();

    let gaps: Vec<f64> = packets.iter().filter_map(|p| p.gap_ms).collect();
    let n = gaps.len() as f64;
    let avg_gap_ms = if n > 0.0 { gaps.iter().sum::<f64>() / n } else { 0.0 };
    let min_gap_ms = gaps.iter().cloned().fold(f64::INFINITY, f64::min);
    let max_gap_ms = gaps.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    let variance = if n > 1.0 {
        gaps.iter().map(|g| (g - avg_gap_ms).powi(2)).sum::<f64>() / n
    } else { 0.0 };
    let std_gap_ms = variance.sqrt();

    let checksum_pass = packets.iter().filter(|p| p.checksum_ok == Some(true)).count() as u64;
    let checksum_fail = packets.iter().filter(|p| p.checksum_ok == Some(false)).count() as u64;

    TimingStats {
        total_packets,
        total_bytes,
        avg_gap_ms,
        min_gap_ms: if min_gap_ms.is_infinite() { 0.0 } else { min_gap_ms },
        max_gap_ms: if max_gap_ms.is_infinite() { 0.0 } else { max_gap_ms },
        std_gap_ms,
        cycle_count: 0,
        avg_cycle_ms: 0.0,
        avg_idle_ms: 0.0,
        checksum_pass,
        checksum_fail,
    }
}

#[tauri::command]
pub async fn export_packets(app: AppHandle, json: String) -> Result<String, String> {
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    // Use async save_file + oneshot to avoid blocking the main thread event loop
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .add_filter("JSON", &["json"])
        .set_file_name(&format!("wirescope-{ts}.json"))
        .save_file(move |path| { let _ = tx.send(path); });

    let file_path = rx.await
        .map_err(|_| "다이얼로그 오류".to_string())?
        .ok_or_else(|| "취소됨".to_string())?;

    let path = file_path.as_path()
        .ok_or_else(|| "잘못된 경로".to_string())?
        .to_path_buf();
    std::fs::write(&path, json.as_bytes()).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

fn hex_to_bytes(hex: &str) -> Result<Vec<u8>, String> {
    let hex = hex.replace([' ', ':', '-'], "");
    if hex.len() % 2 != 0 {
        return Err("Odd-length hex string".into());
    }
    (0..hex.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).map_err(|e| e.to_string()))
        .collect()
}
