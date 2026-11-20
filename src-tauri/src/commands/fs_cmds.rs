use serde::Serialize;
use std::fs;
use std::path::{Component, Path, PathBuf};
use tauri::State;

use crate::config::AppState;

#[derive(Debug, Serialize)]
pub struct TreeNode {
    pub name: String,
    pub path: String,
    /// "dir" | "file"
    pub kind: String,
    /// Files only: language/file-type id used by the frontend for icons and
    /// editor highlighting ("md" | "txt" | "pdf" | "image" | a language id
    /// from the 16-language set: json, xml, html, css, javascript, ...).
    pub file_type: String,
    pub children: Vec<TreeNode>,
}

const IGNORED_DIRS: &[&str] = &[
    "node_modules",
    "target",
    "dist",
    "$recycle.bin",
    "system volume information",
];

fn is_ignored_dir(name: &str) -> bool {
    let lower = name.to_lowercase();
    name.starts_with('.') || IGNORED_DIRS.contains(&lower.as_str())
}

/// Extension → file-type id. `None` = not shown in the tree.
/// Mirrors HiEditor's language registry: markdown/txt plus the 16 code
/// languages, JSON/XML, PDF and images.
fn file_type_of(p: &Path) -> Option<&'static str> {
    let ext = p
        .extension()
        .and_then(|e| e.to_str())?
        .to_ascii_lowercase();
    Some(match ext.as_str() {
        "md" | "markdown" | "mdown" | "mkd" => "md",
        "txt" | "log" => "txt",
        "pdf" => "pdf",
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "svg" => "image",
        "json" | "jsonc" => "json",
        "xml" | "xsl" | "xslt" | "csproj" | "vbproj" | "props" | "targets" | "resx"
        | "plist" => "xml",
        "html" | "htm" => "html",
        "css" => "css",
        "js" | "mjs" | "cjs" | "jsx" => "javascript",
        "ts" | "tsx" | "mts" | "cts" => "typescript",
        "py" | "pyw" => "python",
        "java" => "java",
        "cs" => "csharp",
        "c" | "h" | "cpp" | "hpp" | "cc" | "cxx" => "cpp",
        "go" => "go",
        "rs" => "rust",
        "sql" => "sql",
        "php" | "phtml" => "php",
        "yml" | "yaml" => "yaml",
        "sh" | "bash" | "zsh" => "shell",
        "ini" | "toml" | "cfg" | "conf" => "ini",
        "bat" | "cmd" => "batch",
        _ => return None,
    })
}

pub(crate) fn read_dir_recursive(dir: &Path, depth: usize) -> Result<Vec<TreeNode>, String> {
    // Hard depth cap to avoid pathological trees.
    if depth > 10 {
        return Ok(vec![]);
    }
    let mut entries: Vec<_> = fs::read_dir(dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .collect();
    entries.sort_by_key(|e| e.file_name());

    let mut dirs = Vec::new();
    let mut files = Vec::new();
    for entry in entries {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        let file_type = entry.file_type().map_err(|e| e.to_string())?;
        if file_type.is_dir() {
            if is_ignored_dir(&name) {
                continue;
            }
            let children = read_dir_recursive(&path, depth + 1)?;
            dirs.push(TreeNode {
                name,
                path: path.to_string_lossy().to_string(),
                kind: "dir".into(),
                file_type: String::new(),
                children,
            });
        } else if file_type.is_file() {
            // Show markdown, text, PDF, images and the supported code/config
            // languages; everything else stays out of the tree.
            let Some(ftype) = file_type_of(&path) else {
                continue;
            };
            files.push(TreeNode {
                name,
                path: path.to_string_lossy().to_string(),
                kind: "file".into(),
                file_type: ftype.into(),
                children: vec![],
            });
        }
    }
    // Dirs first, files after, both already sorted by name.
    dirs.extend(files);
    Ok(dirs)
}

#[tauri::command]
pub fn read_tree(root: String) -> Result<Vec<TreeNode>, String> {
    let root = PathBuf::from(&root);
    if !root.is_dir() {
        return Err("workspace_not_found".into());
    }
    read_dir_recursive(&root, 0)
}

/// Reject any path that escapes the workspace: no `..` components allowed,
/// and the normalized (lowercased) string must stay under the workspace prefix.
pub(crate) fn ensure_within(root: &Path, target: &Path) -> Result<(), String> {
    if target
        .components()
        .any(|c| matches!(c, Component::ParentDir))
    {
        return Err("invalid_path".into());
    }

    let root_s = root.to_string_lossy().trim_end_matches(['\\', '/']).to_lowercase();
    let target_s = target
        .to_string_lossy()
        .trim_end_matches(['\\', '/'])
        .to_lowercase();
    let inside = target_s == root_s
        || target_s.starts_with(&format!("{root_s}\\"))
        || target_s.starts_with(&format!("{root_s}/"));
    if inside {
        Ok(())
    } else {
        Err("path_outside_workspace".into())
    }
}

pub(crate) fn workspace_root(state: &State<'_, AppState>) -> Result<PathBuf, String> {
    let ws = state
        .session_workspace
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or("no_workspace")?;
    let root = PathBuf::from(ws);
    if !root.is_dir() {
        return Err("workspace_not_found".into());
    }
    Ok(root)
}

/// Register the workspace for the current session. Called by the frontend
/// whenever a workspace is opened; file commands validate against it, and a
/// recursive FS watcher is (re)started for automatic tree refresh.
#[tauri::command]
pub fn set_session_workspace(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.is_dir() {
        return Err("workspace_not_found".into());
    }
    *state.session_workspace.lock().map_err(|e| e.to_string())? = Some(p.clone());
    // Replacing the session drops the previous watcher (its debounce thread
    // exits when the event channel disconnects). Watch failures are tolerated.
    if let Some(session) = crate::watcher::watch_workspace(&app, &p) {
        *state.watcher.lock().map_err(|e| e.to_string())? = Some(session);
    }
    Ok(())
}

/// 文本读取结果：解码后的内容 + 检测/指定的编码。
#[derive(Debug, Serialize)]
pub struct ReadOut {
    pub text: String,
    /// Encoding key（`utf8` / `utf8-bom` / `utf16le` / `utf16be` /
    /// `gbk` / `gb18030` / `ansi:<label>`），保存时原样回传以保持编码不变。
    pub encoding: String,
    pub encoding_label: String,
    /// True when ANSI 解码出现无法映射的字节（已以替换字符容错）。
    pub lossy: bool,
}

/// 读取文本文件：自动检测编码（BOM → UTF-8 → chardetng 启发式），GBK、
/// UTF-16 等本地文件均可打开。`forced_encoding` 优先于自动检测。
#[tauri::command]
pub fn read_file(
    state: State<'_, AppState>,
    path: String,
    forced_encoding: Option<String>,
) -> Result<ReadOut, String> {
    let root = workspace_root(&state)?;
    let p = PathBuf::from(&path);
    ensure_within(&root, &p)?;
    let bytes = fs::read(&p).map_err(|e| e.to_string())?;
    let (encoding, lossy) = match forced_encoding
        .as_deref()
        .and_then(crate::commands::encoding::Encoding::from_key)
    {
        Some(enc) => (enc, false),
        None => {
            let detected = crate::commands::encoding::detect(&bytes);
            let lossy = matches!(detected, crate::commands::encoding::Encoding::Ansi(_));
            (detected, lossy)
        }
    };
    let text = crate::commands::encoding::decode(&bytes, &encoding);
    Ok(ReadOut {
        text,
        encoding: encoding.key(),
        encoding_label: encoding.label(),
        lossy,
    })
}

/// 写入文本文件。`encoding` 为打开该文件时检测到的编码 key，按原编码回写
/// （GBK 文件保存后仍是 GBK）；缺省 UTF-8。
#[tauri::command]
pub fn write_file(
    state: State<'_, AppState>,
    path: String,
    content: String,
    encoding: Option<String>,
) -> Result<(), String> {
    let root = workspace_root(&state)?;
    let p = PathBuf::from(&path);
    ensure_within(&root, &p)?;
    let enc = encoding
        .as_deref()
        .and_then(crate::commands::encoding::Encoding::from_key)
        .unwrap_or(crate::commands::encoding::Encoding::Utf8);
    let bytes = crate::commands::encoding::encode(&content, &enc);
    fs::write(&p, bytes).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_file(state: State<'_, AppState>, path: String, content: String) -> Result<(), String> {
    let root = workspace_root(&state)?;
    let p = PathBuf::from(&path);
    ensure_within(&root, &p)?;
    if p.exists() {
        return Err("file_exists".into());
    }
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&p, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_dir(state: State<'_, AppState>, path: String) -> Result<(), String> {
    let root = workspace_root(&state)?;
    let p = PathBuf::from(&path);
    ensure_within(&root, &p)?;
    if p.exists() {
        return Err("dir_exists".into());
    }
    fs::create_dir_all(&p).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rename_path(state: State<'_, AppState>, from: String, to: String) -> Result<(), String> {
    let root = workspace_root(&state)?;
    let src = PathBuf::from(&from);
    let dst = PathBuf::from(&to);
    ensure_within(&root, &src)?;
    ensure_within(&root, &dst)?;
    if !src.exists() {
        return Err("source_not_found".into());
    }
    if dst.exists() {
        return Err("target_exists".into());
    }
    fs::rename(&src, &dst).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_path(state: State<'_, AppState>, path: String) -> Result<(), String> {
    let root = workspace_root(&state)?;
    let p = PathBuf::from(&path);
    ensure_within(&root, &p)?;
    if !p.exists() {
        return Ok(());
    }
    if p.is_dir() {
        fs::remove_dir_all(&p).map_err(|e| e.to_string())
    } else {
        fs::remove_file(&p).map_err(|e| e.to_string())
    }
}

/// Read a file as raw bytes (PDF viewer). `ensure_within` still applies.
#[tauri::command]
pub fn read_binary_file(state: State<'_, AppState>, path: String) -> Result<Vec<u8>, String> {
    let root = workspace_root(&state)?;
    let p = PathBuf::from(&path);
    ensure_within(&root, &p)?;
    fs::read(&p).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn path_exists(path: String) -> Result<bool, String> {
    Ok(PathBuf::from(&path).exists())
}

/// Set the currently open note file for the FS watcher. `null` clears it.
#[tauri::command]
pub fn set_watched_file(state: State<'_, AppState>, path: Option<String>) -> Result<(), String> {
    let mut guard = state.watched_file.lock().map_err(|e| e.to_string())?;
    *guard = path.map(PathBuf::from);
    Ok(())
}

/// Query a file's last modification time (Unix milliseconds); null when the
/// file is missing or inaccessible. Used by the frontend to detect external
/// changes and offer to reload the document.
#[tauri::command]
pub fn get_file_mtime(path: String) -> Option<u128> {
    let modified = fs::metadata(&path).ok()?.modified().ok()?;
    let ms = modified
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?
        .as_millis();
    Some(ms)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ensure_within_accepts_inside_paths() {
        let root = Path::new(r"D:\ws");
        assert!(ensure_within(root, Path::new(r"D:\ws\note.md")).is_ok());
        assert!(ensure_within(root, Path::new(r"D:\ws")).is_ok());
        assert!(ensure_within(root, Path::new(r"D:\ws2\note.md")).is_err());
        assert!(ensure_within(root, Path::new(r"D:\ws\..\secret")).is_err());
    }

    #[test]
    fn file_type_classification() {
        assert_eq!(file_type_of(Path::new("a.MD")), Some("md"));
        assert_eq!(file_type_of(Path::new("b.PNG")), Some("image"));
        assert_eq!(file_type_of(Path::new("c.rs")), Some("rust"));
        assert_eq!(file_type_of(Path::new("d.BAT")), Some("batch"));
        assert_eq!(file_type_of(Path::new("e.json")), Some("json"));
        assert_eq!(file_type_of(Path::new("f.csproj")), Some("xml"));
        assert_eq!(file_type_of(Path::new("g.exe")), None);
        assert_eq!(file_type_of(Path::new("h")), None);
    }
}
