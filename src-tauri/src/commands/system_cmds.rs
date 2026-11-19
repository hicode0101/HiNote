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

#[tauri::command]
pub fn reveal_in_explorer(path: String) -> Result<(), String> {
    reveal_item_in_dir(&path).map_err(|e| e.to_string())
}
