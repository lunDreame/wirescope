#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod serial;
mod socket;

use serde::Deserialize;
use std::sync::{Arc, Mutex};
use tauri::AppHandle;

#[derive(Default)]
struct Shared;

#[tauri::command]
async fn list_serial_ports() -> Result<Vec<String>, String> {
  serial::list_ports().map_err(|e| e.to_string())
}

#[tauri::command]
async fn serial_open(app: AppHandle, args: serial::SerialOpenArgs) -> Result<(), String> {
  serial::open_and_spawn(app, args).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn serial_close(conn_id: Option<String>) -> Result<(), String> { 
  serial::close(conn_id).map_err(|e| e.to_string()) 
}

#[derive(Deserialize)]
struct TxArgs { 
  payload: String, 
  append: String,
  #[serde(default = "default_conn_id")]
  conn_id: String,
}

fn default_conn_id() -> String { "main".to_string() }

#[tauri::command]
async fn serial_tx(args: TxArgs) -> Result<(), String> { 
  serial::tx(args.payload, args.append, args.conn_id).map_err(|e| e.to_string()) 
}

#[tauri::command]
async fn socket_open(app: AppHandle, args: socket::SocketOpenArgs) -> Result<(), String> {
  socket::open_and_spawn(app, args).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn socket_close(conn_id: Option<String>) -> Result<(), String> { 
  socket::close(conn_id).map_err(|e| e.to_string()) 
}

#[tauri::command]
async fn socket_tx(args: TxArgs) -> Result<(), String> { 
  socket::tx(args.payload, args.append, args.conn_id).map_err(|e| e.to_string()) 
}

fn main() {
  tauri::Builder::default()
    .plugin(tauri_plugin_log::Builder::default().build())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_dialog::init())
    .manage(Arc::new(Mutex::new(Shared::default())))
    .invoke_handler(tauri::generate_handler![
      list_serial_ports, serial_open, serial_close, serial_tx,
      socket_open, socket_close, socket_tx
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
