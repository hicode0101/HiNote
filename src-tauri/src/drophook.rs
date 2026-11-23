//! Windows-only: absolute paths for files/folders dropped from Explorer.
//!
//! `dragDropEnabled` stays false so HTML5 drag events (tree→editor drags)
//! keep working, but WebView2 hides dropped-item paths from page JS
//! (`File.path` is Electron-only). Bridge the gap instead: the page forwards
//! the dropped `File` objects via
//! `chrome.webview.postMessageWithAdditionalObjects("hinote-drop-files", files)`
//! and this hook reads their absolute paths (`ICoreWebView2File::Path`) and
//! emits them back as the `dropped-paths` event. Requires WebView2 Runtime
//! ≥ 1.0.1774.30 (Evergreen runtimes are auto-updated).

use tauri::{AppHandle, Emitter};

const DROP_MARKER: &str = "hinote-drop-files";
pub const DROP_EVENT: &str = "dropped-paths";

#[cfg(windows)]
pub fn install(app: &AppHandle, window: &tauri::WebviewWindow) {
  use webview2_com::{
    Microsoft::Web::WebView2::Win32::{ICoreWebView2File, ICoreWebView2WebMessageReceivedEventArgs2},
    take_pwstr, WebMessageReceivedEventHandler,
  };
  use windows::core::{Interface, PWSTR};

  let app = app.clone();
  let _ = window.with_webview(move |webview| {
    let Ok(core) = (unsafe { webview.controller().CoreWebView2() }) else {
      return;
    };
    // Runs for every postMessage (Tauri IPC included); the marker check
    // keeps regular traffic at one cheap string allocation.
    let handler = WebMessageReceivedEventHandler::create(Box::new(move |_, args| {
      let Some(args) = args else {
        return Ok(());
      };
      let message = {
        let mut json = PWSTR::null();
        unsafe { args.WebMessageAsJson(&mut json)? };
        take_pwstr(json)
      };
      if !message.contains(DROP_MARKER) {
        return Ok(());
      }
      let Ok(args2) = args.cast::<ICoreWebView2WebMessageReceivedEventArgs2>() else {
        return Ok(());
      };
      let Ok(objects) = (unsafe { args2.AdditionalObjects() }) else {
        return Ok(());
      };
      let mut count = 0u32;
      if (unsafe { objects.Count(&mut count) }).is_err() || count == 0 {
        return Ok(());
      }
      let mut paths = Vec::new();
      for i in 0..count {
        // Collection entries can be null / non-file objects; skip those.
        let Ok(obj) = (unsafe { objects.GetValueAtIndex(i) }) else {
          continue;
        };
        let Ok(file) = obj.cast::<ICoreWebView2File>() else {
          continue;
        };
        let mut path = PWSTR::null();
        if unsafe { file.Path(&mut path) }.is_ok() {
          let path = take_pwstr(path);
          if !path.is_empty() {
            paths.push(path);
          }
        }
      }
      if !paths.is_empty() {
        let _ = app.emit(DROP_EVENT, paths);
      }
      Ok(())
    }));
    // WebView2 holds its own reference after registration, so the Rust
    // wrapper can drop here (same lifetime pattern as wry's IPC handler).
    let mut token = 0i64;
    let _ = unsafe { core.add_WebMessageReceived(&handler, &mut token) };
  });
}

#[cfg(not(windows))]
pub fn install(_app: &AppHandle, _window: &tauri::WebviewWindow) {}
