pub mod commands;
pub mod config;
pub mod recent;
pub mod watcher;

use config::AppConfig;
use tauri::Manager;

/// Disable WebView2's built-in browser context menu at the engine level
/// (ICoreWebView2Settings6::SetAreDefaultContextMenusEnabled). Frontend
/// surfaces own their custom menus; areas without one simply get no menu.
#[cfg(windows)]
fn disable_webview_default_context_menu(window: &tauri::WebviewWindow) {
  use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings6;
  use windows::core::Interface;
  let _ = window.with_webview(move |webview| {
    unsafe {
      let Ok(core) = webview.controller().CoreWebView2() else {
        return;
      };
      let Ok(settings) = core.Settings() else {
        return;
      };
      if let Ok(settings6) = settings.cast::<ICoreWebView2Settings6>() {
        let _ = settings6.SetAreDefaultContextMenusEnabled(false);
      }
    }
  });
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let cfg = AppConfig::load(app.handle())?;
            app.manage(config::AppState {
                config: std::sync::Mutex::new(cfg),
                session_workspace: std::sync::Mutex::new(None),
                watcher: std::sync::Mutex::new(None),
                watched_file: std::sync::Mutex::new(None),
            });
            #[cfg(windows)]
            if let Some(window) = app.get_webview_window("main") {
                disable_webview_default_context_menu(&window);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::save_config,
            commands::set_session_workspace,
            recent::get_recent_workspaces,
            recent::add_recent_workspace,
            recent::remove_recent_workspace,
            commands::read_tree,
            commands::search_workspace,
            commands::read_file,
            commands::read_binary_file,
            commands::write_file,
            commands::create_file,
            commands::create_dir,
            commands::rename_path,
            commands::delete_path,
            commands::path_exists,
            commands::get_file_mtime,
            commands::set_watched_file,
            commands::format_text,
            commands::save_paste_image,
            commands::save_image_as,
            commands::copy_image_to_clipboard,
            commands::pick_directory,
            commands::pick_image_file,
            commands::reveal_in_explorer,
            commands::get_version,
            commands::open_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
