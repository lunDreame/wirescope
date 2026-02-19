#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod payload;
mod serial;
mod socket;
mod telemetry;

use serde::Deserialize;
use tauri::AppHandle;

#[tauri::command]
async fn list_serial_ports() -> Result<Vec<String>, String> {
    serial::list_ports().map_err(|error| error.to_string())
}

#[tauri::command]
async fn serial_open(app: AppHandle, args: serial::SerialOpenArgs) -> Result<(), String> {
    serial::open_and_spawn(app, args)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn serial_close(conn_id: Option<String>) -> Result<(), String> {
    serial::close(conn_id).map_err(|error| error.to_string())
}

#[tauri::command]
async fn serial_connected(conn_id: Option<String>) -> Result<bool, String> {
    let id = conn_id.unwrap_or_else(default_conn_id);
    Ok(serial::is_connected(&id))
}

#[derive(Deserialize)]
struct TxArgs {
    payload: String,
    append: String,
    #[serde(default = "default_conn_id")]
    conn_id: String,
}

fn default_conn_id() -> String {
    String::from("main")
}

#[tauri::command]
async fn serial_tx(args: TxArgs) -> Result<(), String> {
    serial::tx(args.payload, args.append, args.conn_id).map_err(|error| error.to_string())
}

#[tauri::command]
async fn socket_open(app: AppHandle, args: socket::SocketOpenArgs) -> Result<(), String> {
    socket::open_and_spawn(app, args)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn socket_close(conn_id: Option<String>) -> Result<(), String> {
    socket::close(conn_id).map_err(|error| error.to_string())
}

#[tauri::command]
async fn socket_connected(conn_id: Option<String>) -> Result<bool, String> {
    let id = conn_id.unwrap_or_else(default_conn_id);
    Ok(socket::is_connected(&id))
}

#[tauri::command]
async fn socket_tx(args: TxArgs) -> Result<(), String> {
    socket::tx(args.payload, args.append, args.conn_id).map_err(|error| error.to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            list_serial_ports,
            serial_open,
            serial_close,
            serial_connected,
            serial_tx,
            socket_open,
            socket_close,
            socket_connected,
            socket_tx
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
