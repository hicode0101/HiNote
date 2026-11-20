//! Recursive filesystem watcher for the session workspace.
//!
//! Two event-driven flows, both debounced in Rust (no frontend polling):
//! - tree changes (diffed against a snapshot) → `workspace-changed`;
//! - events touching the currently open note → `file-changed`, which makes
//!   the frontend offer to reload the document.

use notify::{RecursiveMode, Watcher};
use std::path::{Path, PathBuf};
use std::sync::{mpsc, Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

use crate::commands::fs_cmds::read_dir_recursive;
use crate::config::AppState;

/// Keep-alive handle for the current workspace watcher.
pub struct WatcherSession {
    _watcher: notify::RecommendedWatcher,
    /// Secondary handle to the snapshot cache; the debounce thread owns the
    /// primary Arc, this clone keeps the cache alive with the session.
    _tree_cache: Arc<Mutex<Option<String>>>,
}

const DEBOUNCE_MS: u64 = 600;

fn snapshot_tree(root: &Path) -> Option<String> {
    let tree = read_dir_recursive(root, 0).ok()?;
    serde_json::to_string(&tree).ok()
}

/// True when any FS event path refers to the watched file. Paths are compared
/// case-insensitively (Windows filesystems are case-insensitive).
fn paths_match_watched(paths: &[PathBuf], watched: &Path) -> bool {
    let watched_s = watched
        .to_string_lossy()
        .trim_end_matches(['\\', '/'])
        .to_lowercase();
    paths.iter().any(|p| {
        p.to_string_lossy()
            .trim_end_matches(['\\', '/'])
            .to_lowercase()
            == watched_s
    })
}

/// Start (or replace) the recursive watcher for `root`.
/// Watch failures are swallowed: the tree stays functional, just without
/// automatic refresh.
pub fn watch_workspace(app: &AppHandle, root: &PathBuf) -> Option<WatcherSession> {
    let (tx, rx) = mpsc::channel::<Vec<PathBuf>>();
    let mut watcher = match notify::recommended_watcher(
        move |res: Result<notify::Event, notify::Error>| {
            if let Ok(event) = res {
                let _ = tx.send(event.paths);
            }
        },
    ) {
        Ok(w) => w,
        Err(_) => return None,
    };
    if watcher.watch(root, RecursiveMode::Recursive).is_err() {
        return None;
    }

    let cache = Arc::new(Mutex::new(snapshot_tree(root)));
    let thread_root = root.clone();
    let thread_cache = Arc::clone(&cache);
    let app = app.clone();
    std::thread::spawn(move || {
        loop {
            // Channel disconnected => the watcher was dropped => stop.
            let Ok(first) = rx.recv() else { return };
            let mut pending = first;
            // Coalesce bursts: swallow events until 600ms of quiet.
            loop {
                match rx.recv_timeout(Duration::from_millis(DEBOUNCE_MS)) {
                    Ok(more) => pending.extend(more),
                    Err(mpsc::RecvTimeoutError::Timeout) => break,
                    Err(mpsc::RecvTimeoutError::Disconnected) => return,
                }
            }

            // Open note touched → tell the frontend to run its reload flow.
            // (Its mtime baseline check filters out our own saves.)
            let watched = app
                .state::<AppState>()
                .watched_file
                .lock()
                .ok()
                .and_then(|g| g.clone());
            if let Some(w) = watched {
                if paths_match_watched(&pending, &w) {
                    let _ = app.emit("file-changed", ());
                }
            }

            // Tree diff → emit only when the tree actually changed (our own
            // note writes only touch mtime and don't cause refresh churn).
            let Some(json) = snapshot_tree(&thread_root) else { continue };
            let Ok(mut guard) = thread_cache.lock() else { return };
            if guard.as_deref() == Some(json.as_str()) {
                continue;
            }
            *guard = Some(json);
            drop(guard);
            let _ = app.emit("workspace-changed", ());
        }
    });

    Some(WatcherSession {
        _watcher: watcher,
        _tree_cache: cache,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn paths_match_watched_is_exact_and_case_insensitive() {
        let watched = Path::new(r"D:\ws\images\note.md");
        assert!(paths_match_watched(&[PathBuf::from(r"d:\WS\IMAGES\NOTE.MD")], watched));
        assert!(paths_match_watched(
            &[PathBuf::from(r"D:\ws\other.txt"), PathBuf::from(r"D:\ws\images\note.md\")],
            watched
        ));
        assert!(!paths_match_watched(&[PathBuf::from(r"D:\ws\images")], watched));
        assert!(!paths_match_watched(
            &[PathBuf::from(r"D:\ws\images\note.md.bak")],
            watched
        ));
    }

    #[test]
    fn watcher_receives_fs_events() {
        let dir = std::env::temp_dir().join(format!("hinote_watch_test_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        let (tx, rx) = mpsc::channel();
        let mut watcher = notify::recommended_watcher(
            move |_res: Result<notify::Event, notify::Error>| {
                let _ = tx.send(());
            },
        )
        .unwrap();
        watcher.watch(&dir, RecursiveMode::Recursive).unwrap();

        std::fs::write(dir.join("a.md"), "x").unwrap();
        assert!(
            rx.recv_timeout(Duration::from_secs(5)).is_ok(),
            "no FS event received"
        );

        drop(watcher);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn snapshot_tree_serializes() {
        let dir = std::env::temp_dir().join(format!("hinote_snap_test_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("sub")).unwrap();
        std::fs::write(dir.join("note.md"), "# hi").unwrap();
        let json = snapshot_tree(&dir);
        assert!(json.is_some());
        assert!(json.unwrap().contains("note.md"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
