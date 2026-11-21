import { convertFileSrc, isTauri } from "./tauri";

/** Schemes the webview can load as-is (no local resolution needed). */
const EXTERNAL_SCHEME_RE = /^(https?|data|asset|blob|file):/i;

/** Tauri asset-protocol URLs (`http(s)://asset.localhost/...` on Windows). */
const ASSET_HTTP_RE = /^(https?):\/\/asset\.localhost\/(.+)$/i;
const ASSET_SCHEME_RE = /^asset:\/\/localhost\/(.*)$/i;

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Resolve an image reference found inside a note to an absolute path:
 * - absolute drive paths pass through unchanged;
 * - relative paths are resolved against the note's directory (`..` supported).
 * Returns null for web/data URLs — nothing to resolve locally.
 */
export function refToAbsPath(ref: string, notePath: string): string | null {
  const decoded = safeDecode(ref);
  if (EXTERNAL_SCHEME_RE.test(decoded)) return null;
  if (/^[a-zA-Z]:[\\/]/.test(decoded) || decoded.startsWith("/")) return decoded;

  const noteDir = notePath.replace(/[\\/][^\\/]+$/, "");
  const stack = noteDir.split(/[\\/]/).filter(Boolean);
  for (const part of decoded.split(/[\\/]/)) {
    if (!part || part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return stack.join("\\");
}

/** Make an absolute path relative to the note's directory when possible. */
export function absToRef(abs: string, notePath: string): string | null {
  const noteDir = notePath.replace(/[\\/][^\\/]+$/, "").replace(/[\\/]+$/, "");
  const lowerAbs = abs.toLowerCase();
  const lowerDir = noteDir.toLowerCase();
  if (lowerAbs === lowerDir) return null;
  const rest = lowerAbs.startsWith(lowerDir + "\\")
    ? abs.slice(noteDir.length + 1)
    : lowerAbs.startsWith(lowerDir + "/")
      ? abs.slice(noteDir.length + 1)
      : null;
  if (rest === null) return abs.replace(/\\/g, "/"); // outside the note dir: keep absolute
  return rest.replace(/\\/g, "/");
}

/** Webview-loadable URL for a local file (asset protocol inside Tauri). */
export function displayUrl(absPath: string): string {
  if (isTauri()) return convertFileSrc(absPath);
  return absPath;
}

/** Absolute local path for a Tauri asset URL; null for non-asset sources. */
export function assetUrlToAbsPath(url: string): string | null {
  const http = ASSET_HTTP_RE.exec(url);
  const scheme = http ? null : ASSET_SCHEME_RE.exec(url);
  if (!http && !scheme) return null;
  const abs = safeDecode((http ? http[2] : scheme![1]).replace(/\/+$/, ""));
  return abs || null;
}
