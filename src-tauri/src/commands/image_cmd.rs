use base64::Engine;
use rand::Rng;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

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

/// Open a save dialog and write the image (copied from a local file, or raw
/// bytes from a remote URL) to the chosen location. Returns the saved path,
/// or None when the dialog was cancelled.
#[tauri::command]
pub async fn save_image_as(
    app: AppHandle,
    path: Option<String>,
    data_base64: Option<String>,
    ext: Option<String>,
    suggested_name: Option<String>,
) -> Result<Option<String>, String> {
    let src_path = path.map(PathBuf::from);
    let ext_s = ext.clone().or_else(|| {
        src_path
            .as_ref()
            .and_then(|p| p.extension().and_then(|e| e.to_str()))
            .map(|e| e.to_lowercase())
    });
    let fallback_ext = ext_s.clone().unwrap_or_else(|| "png".into());
    let name = suggested_name.unwrap_or_else(|| format!("image.{fallback_ext}"));

    let (tx, mut rx) = tauri::async_runtime::channel::<Option<String>>(1);
    let mut builder = app.dialog().file().set_file_name(&name);
    if let Some(src) = &src_path {
        if let Some(dir) = src.parent() {
            builder = builder.set_directory(dir.to_path_buf());
        }
    }
    let mut filter_exts: Vec<String> = ["png", "jpg", "jpeg", "gif", "webp", "bmp"]
        .into_iter()
        .map(String::from)
        .collect();
    if let Some(e) = &ext_s {
        let e = e.to_lowercase();
        if !filter_exts.iter().any(|x| x == &e) {
            filter_exts.insert(0, e);
        }
    }
    let filter_refs: Vec<&str> = filter_exts.iter().map(String::as_str).collect();
    builder = builder.add_filter("Image", &filter_refs);
    builder.save_file(move |file_path| {
        let _ = tx.blocking_send(file_path.map(|p| p.to_string()));
    });
    let picked = rx
        .recv()
        .await
        .ok_or_else(|| "dialog_channel_closed".to_string())?;
    let Some(picked) = picked else {
        return Ok(None); // cancelled
    };
    let mut target = PathBuf::from(&picked);
    if target.extension().is_none() {
        target.set_extension(fallback_ext);
    }

    if let Some(b64) = data_base64 {
        let data = base64::engine::general_purpose::STANDARD
            .decode(b64.as_bytes())
            .map_err(|e| e.to_string())?;
        if data.len() > MAX_IMAGE_BYTES {
            return Err("image_too_large".into());
        }
        fs::write(&target, data).map_err(|e| e.to_string())?;
    } else if let Some(src) = src_path {
        fs::copy(&src, &target).map_err(|e| e.to_string())?;
    } else {
        return Err("no_image_data".into());
    }

    Ok(Some(target.to_string_lossy().to_string()))
}

/// Copy an image to the OS clipboard as a bitmap, decoded from a local file
/// or from base64 bytes (remote image). Runs on a blocking thread: neither
/// arboard nor image decoding belongs on the async runtime.
#[tauri::command]
pub async fn copy_image_to_clipboard(
    path: Option<String>,
    data_base64: Option<String>,
) -> Result<(), String> {
    let bytes = if let Some(p) = path {
        fs::read(p).map_err(|e| e.to_string())?
    } else if let Some(b64) = data_base64 {
        base64::engine::general_purpose::STANDARD
            .decode(b64.as_bytes())
            .map_err(|e| e.to_string())?
    } else {
        return Err("no_image_data".into());
    };
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let img = image::load_from_memory(&bytes).map_err(|e| e.to_string())?;
        let rgba = img.to_rgba8();
        let (width, height) = rgba.dimensions();
        let data = arboard::ImageData {
            width: width as usize,
            height: height as usize,
            bytes: rgba.into_raw().into(),
        };
        let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
        clipboard.set_image(data).map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
