use tauri::{AppHandle, State};
use tauri_plugin_opener::reveal_item_in_dir;

use crate::config::{AppConfig, AppState};

#[tauri::command]
pub fn get_config(state: State<'_, AppState>) -> Result<AppConfig, String> {
    let cfg = state.config.lock().map_err(|e| e.to_string())?;
    Ok(cfg.clone())
}

#[tauri::command]
pub fn save_config(
    app: AppHandle,
    state: State<'_, AppState>,
    config: AppConfig,
) -> Result<(), String> {
    {
        let mut cfg = state.config.lock().map_err(|e| e.to_string())?;
        *cfg = config;
        cfg.save(&app)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn pick_directory(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, mut rx) = tauri::async_runtime::channel::<Option<String>>(1);
    app.dialog().file().pick_folder(move |path| {
        let _ = tx.blocking_send(path.map(|p| p.to_string()));
    });
    rx.recv()
        .await
        .ok_or_else(|| "dialog_channel_closed".to_string())
}

#[tauri::command]
pub async fn pick_image_file(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, mut rx) = tauri::async_runtime::channel::<Option<String>>(1);
    app.dialog()
        .file()
        .add_filter(
            "Images",
            &["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"],
        )
        .pick_file(move |path| {
            let _ = tx.blocking_send(path.map(|p| p.to_string()));
        });
    rx.recv()
        .await
        .ok_or_else(|| "dialog_channel_closed".to_string())
}

/// Save exported file bytes (base64, e.g. drawio SVG/PNG export) via a
/// native save dialog. Returns the written path, or None when cancelled.
#[tauri::command]
pub async fn export_file_as(
    app: AppHandle,
    data_base64: String,
    suggested_name: String,
    filter_name: String,
    extensions: Vec<String>,
) -> Result<Option<String>, String> {
    use base64::Engine;
    use tauri_plugin_dialog::DialogExt;
    let data = base64::engine::general_purpose::STANDARD
        .decode(data_base64.as_bytes())
        .map_err(|e| e.to_string())?;
    let exts: Vec<String> = extensions
        .iter()
        .map(|e| e.trim_start_matches('.').to_lowercase())
        .filter(|e| !e.is_empty())
        .collect();
    let fallback_ext = exts.first().cloned().unwrap_or_else(|| "svg".into());

    let (tx, mut rx) = tauri::async_runtime::channel::<Option<String>>(1);
    let filter_refs: Vec<&str> = exts.iter().map(String::as_str).collect();
    app.dialog()
        .file()
        .set_file_name(&suggested_name)
        .add_filter(&filter_name, &filter_refs)
        .save_file(move |file_path| {
            let _ = tx.blocking_send(file_path.map(|p| p.to_string()));
        });
    let picked = rx
        .recv()
        .await
        .ok_or_else(|| "dialog_channel_closed".to_string())?;
    let Some(picked) = picked else {
        return Ok(None); // cancelled
    };
    let mut target = std::path::PathBuf::from(&picked);
    if target.extension().is_none() {
        target.set_extension(&fallback_ext);
    }
    std::fs::write(&target, data).map_err(|e| e.to_string())?;
    Ok(Some(target.to_string_lossy().to_string()))
}

#[tauri::command]
pub fn reveal_in_explorer(path: String) -> Result<(), String> {
    reveal_item_in_dir(&path).map_err(|e| e.to_string())
}

/// App version from Cargo.toml (single source of truth, About dialog).
#[tauri::command]
pub fn get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Open a URL in the system browser (About dialog homepage link).
#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    tauri_plugin_opener::open_url(&url, None::<&str>).map_err(|e| e.to_string())
}
