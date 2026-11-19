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

fn is_markdown(p: &Path) -> bool {
    matches!(
        p.extension().and_then(|e| e.to_str()),
        Some(ext) if ext.eq_ignore_ascii_case("md") || ext.eq_ignore_ascii_case("markdown")
    )
}

fn read_dir_recursive(dir: &Path, depth: usize) -> Result<Vec<TreeNode>, String> {
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
                children,
            });
        } else if file_type.is_file() && is_markdown(&path) {
            files.push(TreeNode {
                name,
                path: path.to_string_lossy().to_string(),
                kind: "file".into(),
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
/// whenever a workspace is opened; file commands validate against it.
#[tauri::command]
pub fn set_session_workspace(state: State<'_, AppState>, path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.is_dir() {
        return Err("workspace_not_found".into());
    }
    *state.session_workspace.lock().map_err(|e| e.to_string())? = Some(p);
    Ok(())
}

#[tauri::command]
pub fn read_file(state: State<'_, AppState>, path: String) -> Result<String, String> {
    let root = workspace_root(&state)?;
    let p = PathBuf::from(&path);
    ensure_within(&root, &p)?;
    fs::read_to_string(&p).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_file(state: State<'_, AppState>, path: String, content: String) -> Result<(), String> {
    let root = workspace_root(&state)?;
    let p = PathBuf::from(&path);
    ensure_within(&root, &p)?;
    fs::write(&p, content).map_err(|e| e.to_string())
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

#[tauri::command]
pub fn path_exists(path: String) -> Result<bool, String> {
    Ok(PathBuf::from(&path).exists())
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
}
