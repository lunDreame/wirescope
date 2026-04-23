mod checksum;
mod commands;
mod serial_port;
mod socket;
mod splitter;
mod state;

use commands::*;
use state::new_state;

/// Holds a pending update so the frontend can trigger install as a second step.
pub struct PendingUpdate(pub parking_lot::Mutex<Option<tauri_plugin_updater::Update>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(new_state())
        .manage(PendingUpdate(parking_lot::Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            list_serial_ports,
            connect_serial,
            connect_tcp,
            disconnect,
            send_bytes,
            get_packets,
            clear_packets,
            get_sessions,
            set_splitter,
            get_splitter,
            compute_checksum,
            compute_all_checksums,
            get_timing_stats,
            export_packets,
            check_update,
            install_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
