mod checksum;
mod commands;
mod serial_port;
mod socket;
mod splitter;
mod state;

use commands::*;
use state::new_state;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(new_state())
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
