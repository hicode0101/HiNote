use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

use crate::config::data_dir;

const RECENT_FILE: &str = "recent_workspaces.json";
const MAX_RECENTS: usize = 10;

fn recents_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join(RECENT_FILE))
}

/// Pure list merge used by `add_recent_workspace`: dedupe case-insensitively
/// (Windows paths), move the entry to the front, cap the list length.
pub(crate) fn merge_recent(list: Vec<String>, path: &str) -> Vec<String> {
    let lower = path.to_lowercase();
    let mut out: Vec<String> = list
        .into_iter()
        .filter(|p| p.to_lowercase() != lower)
        .collect();
    out.insert(0, path.to_string());
    out.truncate(MAX_RECENTS);
    out
}

pub(crate) fn read_list(app: &AppHandle) -> Vec<String> {
    let Ok(path) = recents_path(app) else {
        return vec![];
    };
    let Ok(raw) = fs::read_to_string(path) else {
        return vec![];
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

pub(crate) fn write_list(app: &AppHandle, list: &[String]) -> Result<(), String> {
    let path = recents_path(app)?;
    let json = serde_json::to_string_pretty(list).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

/// Recently opened workspace dirs (most recent first), skipping dirs that no
/// longer exist on disk.
#[tauri::command]
pub fn get_recent_workspaces(app: AppHandle) -> Result<Vec<String>, String> {
    Ok(read_list(&app)
        .into_iter()
        .filter(|p| Path::new(p).is_dir())
        .collect())
}

#[tauri::command]
pub fn add_recent_workspace(app: AppHandle, path: String) -> Result<(), String> {
    let list = merge_recent(read_list(&app), &path);
    write_list(&app, &list)
}

#[tauri::command]
pub fn remove_recent_workspace(app: AppHandle, path: String) -> Result<(), String> {
    let lower = path.to_lowercase();
    let list: Vec<String> = read_list(&app)
        .into_iter()
        .filter(|p| p.to_lowercase() != lower)
        .collect();
    write_list(&app, &list)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn merge_dedupes_moves_front_and_caps() {
        let list = merge_recent(vec!["a".into(), "b".into()], "C:\\ws");
        assert_eq!(list, vec!["C:\\ws", "a", "b"]);
        let list = merge_recent(list, "a");
        assert_eq!(list, vec!["a", "C:\\ws", "b"]);
    }

    #[test]
    fn merge_dedupe_is_case_insensitive() {
        let list = merge_recent(vec!["D:\\Work".into()], "d:\\work");
        assert_eq!(list, vec!["d:\\work"]);
    }

    #[test]
    fn merge_caps_at_ten() {
        let mut list: Vec<String> = (0..12).map(|i| format!("p{i}")).collect();
        for i in 12..14 {
            list = merge_recent(list, &format!("p{i}"));
        }
        assert_eq!(list.len(), 10);
        assert_eq!(list[0], "p13");
    }
}
