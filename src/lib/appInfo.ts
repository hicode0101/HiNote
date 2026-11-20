/**
 * Static app metadata shared by the About dialog and other surfaces.
 *
 * NOTE: the app version is intentionally NOT defined here. The single
 * source of truth is `src-tauri/Cargo.toml` (`[package] version`); the
 * frontend reads it via the `get_version` IPC command.
 */
export const APP_HOMEPAGE = "https://github.com/hicode0101";
export const APP_AUTHOR = "hicode0101";
