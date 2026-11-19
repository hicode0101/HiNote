use base64::Engine;
use rand::Rng;
use std::fs;
use std::path::PathBuf;
use tauri::State;

use crate::commands::fs_cmds::{ensure_within, workspace_root};
use crate::config::AppState;

const MAX_IMAGE_BYTES: usize = 20 * 1024 * 1024;

fn random_suffix() -> String {
    const CHARSET: &[u8] = b"abcdefghijklmnopqrstuvwxyz0123456789";
    let mut rng = rand::rng();
    (0..6)
        .map(|_| {
            let i = rng.random_range(0..CHARSET.len());
            CHARSET[i] as char
        })
        .collect()
}

fn sanitize_ext(ext: &str) -> String {
    let cleaned: String = ext
        .to_lowercase()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect();
    if cleaned.is_empty() || cleaned.len() > 5 {
        "png".into()
    } else {
        cleaned
    }
}

/// Save a pasted/picked image next to the current note, under the configured
/// images directory. `data_base64` is used for clipboard pastes, while
/// `source_path` is used for picked files (copied as-is). Returns the relative
/// path that should be inserted into the markdown source.
#[tauri::command]
pub fn save_paste_image(
    state: State<'_, AppState>,
    note_path: String,
    ext: String,
    data_base64: Option<String>,
    source_path: Option<String>,
) -> Result<String, String> {
    let root = workspace_root(&state)?;
    let note = PathBuf::from(&note_path);
    ensure_within(&root, &note)?;
    let note_dir = note.parent().ok_or("bad_note_path")?;

    let images_dir_name = {
        let cfg = state.config.lock().map_err(|e| e.to_string())?;
        cfg.images_dir.clone()
    };

    let images_dir = note_dir.join(&images_dir_name);
    fs::create_dir_all(&images_dir).map_err(|e| e.to_string())?;

    let ext = sanitize_ext(&ext);
    let ts = chrono::Local::now().format("%Y%m%d%H%M%S");
    let filename = format!("{}_{}.{}", ts, random_suffix(), ext);

    let target = images_dir.join(&filename);
    if let Some(b64) = data_base64 {
        let data = base64::engine::general_purpose::STANDARD
            .decode(b64.as_bytes())
            .map_err(|e| e.to_string())?;
        if data.len() > MAX_IMAGE_BYTES {
            return Err("image_too_large".into());
        }
        fs::write(&target, data).map_err(|e| e.to_string())?;
    } else if let Some(src) = source_path {
        let src = PathBuf::from(&src);
        if !src.is_file() {
            return Err("source_not_found".into());
        }
        let meta = fs::metadata(&src).map_err(|e| e.to_string())?;
        if meta.len() as usize > MAX_IMAGE_BYTES {
            return Err("image_too_large".into());
        }
        fs::copy(&src, &target).map_err(|e| e.to_string())?;
    } else {
        return Err("no_image_data".into());
    }

    Ok(format!("{}/{}", images_dir_name, filename))
}
