use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

/// Application settings persisted to `{app_data_dir}/config.json`.
/// Field values mirror what the frontend stores, so both sides agree.
/// Note: the open workspace is NOT restored automatically on startup;
/// the welcome screen lists recents from `recent_workspaces.json` instead.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AppConfig {
    pub images_dir: String,
    /// system | zh-CN | en-US
    pub language: String,
    /// system | light | dark
    pub theme: String,
    /// Markdown 打开时默认的经典子视图：edit | split | preview
    pub editor_view: String,
    /// Left tree panel hidden (editor maximized).
    pub sidebar_collapsed: bool,
    /// Auto-save edits to disk (default off; Ctrl+S always works).
    pub autosave: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            images_dir: "images".into(),
            language: "system".into(),
            theme: "system".into(),
            editor_view: "edit".into(),
            sidebar_collapsed: false,
            autosave: false,
        }
    }
}

pub struct AppState {
    pub config: std::sync::Mutex<AppConfig>,
    /// Workspace of the current session (not persisted; the frontend sets it
    /// via `set_session_workspace` when a workspace is opened). All file
    /// commands validate paths against this root.
    pub session_workspace: std::sync::Mutex<Option<PathBuf>>,
    /// Live recursive watcher for the session workspace. Replaced whenever a
    /// new workspace is opened; dropped (and watching stops) when `None`.
    pub watcher: std::sync::Mutex<Option<crate::watcher::WatcherSession>>,
    /// Currently open note file; watcher events matching it trigger the
    /// frontend's reload-confirmation flow (event-driven, no polling).
    pub watched_file: std::sync::Mutex<Option<PathBuf>>,
}

/// Ensure the app data dir exists and return it.
pub(crate) fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

impl AppConfig {
    fn config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
        Ok(data_dir(app)?.join("config.json"))
    }

    pub fn load(app: &tauri::AppHandle) -> Result<Self, String> {
        let path = Self::config_path(app)?;
        if path.exists() {
            let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
            serde_json::from_str(&raw).map_err(|e| e.to_string())
        } else {
            Ok(Self::default())
        }
    }

    pub fn save(&self, app: &tauri::AppHandle) -> Result<(), String> {
        let path = Self::config_path(app)?;
        let json = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
        fs::write(&path, json).map_err(|e| e.to_string())
    }
}
