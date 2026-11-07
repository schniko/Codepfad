#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use tauri::{AppHandle, State};
use tauri_plugin_updater::{Update, UpdaterExt};

#[tauri::command]
async fn save_project(name: String, bytes: Vec<u8>) -> Result<bool, String> {
    let destination = rfd::AsyncFileDialog::new()
        .set_file_name(&name)
        .add_filter("ZIP-Projekt", &["zip"])
        .save_file().await;
    if let Some(file) = destination {
        file.write(&bytes).await.map_err(|error| error.to_string())?;
        return Ok(true);
    }
    Ok(false)
}

struct DownloadedUpdate {
    update: Update,
    bytes: Vec<u8>,
}

type PendingUpdate = Mutex<Option<DownloadedUpdate>>;

#[tauri::command]
async fn check_app_update(
    app: AppHandle,
    pending: State<'_, PendingUpdate>,
) -> Result<Option<String>, String> {
    let updater = app.updater().map_err(|error| error.to_string())?;
    let Some(update) = updater.check().await.map_err(|error| error.to_string())? else {
        return Ok(None);
    };
    let bytes = update.download(|_, _| {}, || {}).await.map_err(|error| error.to_string())?;
    let version = update.version.clone();
    *pending.lock().map_err(|error| error.to_string())? = Some(DownloadedUpdate { update, bytes });
    Ok(Some(version))
}

#[tauri::command]
async fn install_app_update(app: AppHandle, pending: State<'_, PendingUpdate>) -> Result<(), String> {
    {
        let guard = pending.lock().map_err(|error| error.to_string())?;
        let ready = guard.as_ref().ok_or("Kein Update verfügbar")?;
        ready.update.install(&ready.bytes).map_err(|error| error.to_string())?;
    }
    app.restart()
}

fn main() {
    tauri::Builder::default()
        .manage(PendingUpdate::default())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![save_project, check_app_update, install_app_update])
        .run(tauri::generate_context!())
        .expect("Codepfad konnte nicht gestartet werden");
}
