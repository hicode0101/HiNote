import { invoke, convertFileSrc } from "@tauri-apps/api/core";

export interface TreeNode {
  name: string;
  path: string;
  kind: "dir" | "file";
  /** Files only: file-type id (md/txt/pdf/image or a language id). */
  file_type?: string;
  children: TreeNode[];
}

export interface AppConfig {
  images_dir: string;
  language: string;
  theme: string;
  editor_mode: string;
  sidebar_collapsed: boolean;
  autosave: boolean;
}

/** Text file read result with detected encoding info. */
export interface ReadOut {
  text: string;
  /** Encoding key: utf8 / utf8-bom / utf16le / utf16be / gbk / gb18030 / ansi:<label>. */
  encoding: string;
  /** Human-readable label for the status bar (e.g. "UTF-8 (BOM)", "GBK"). */
  encoding_label: string;
  /** True when unmappable bytes were replaced during ANSI decoding. */
  lossy: boolean;
}

/** 工作区搜索命中的单个结果（名称命中或内容命中）。 */
export interface SearchHit {
  path: string;
  /** 相对工作区根的目录部分（根目录下的条目为空串）。 */
  rel_dir: string;
  name: string;
  kind: "dir" | "file";
  /** 与目录树一致的 file_type 标识（文件夹为空串）。 */
  file_type: string;
  /** "name"（名称命中）| "content"（内容命中）。 */
  matched: "name" | "content";
  /** 内容命中时首处匹配的上下文片段。 */
  snippet?: string | null;
}

export interface SearchOut {
  hits: SearchHit[];
  /** 因超时 / 上限提前截断时为 true。 */
  truncated: boolean;
}

/** True when running inside the Tauri webview (vs. a plain browser). */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export const api = {
  getConfig: () => invoke<AppConfig>("get_config"),
  saveConfig: (config: AppConfig) => invoke<void>("save_config", { config }),
  readTree: (root: string) => invoke<TreeNode[]>("read_tree", { root }),
  /** 全文搜索：文件 / 文件夹名 + 文本类文件内容（后端线程执行，带限额）。 */
  searchWorkspace: (query: string, limit?: number) =>
    invoke<SearchOut>("search_workspace", { query, limit: limit ?? null }),
  setSessionWorkspace: (path: string) =>
    invoke<void>("set_session_workspace", { path }),
  readFile: (path: string, forcedEncoding?: string) =>
    invoke<ReadOut>("read_file", { path, forcedEncoding: forcedEncoding ?? null }),
  /** Raw bytes for binary viewers (PDF). */
  readBinaryFile: (path: string) => invoke<number[]>("read_binary_file", { path }),
  /** Run a formatter: "json.pretty" | "json.minify" | "xml.pretty" | "xml.minify". */
  formatText: (text: string, formatterId: string, indent?: number) =>
    invoke<string>("format_text", { text, formatterId, indent: indent ?? null }),
  /** `encoding` = key detected at open time; content is re-encoded to match. */
  writeFile: (path: string, content: string, encoding?: string) =>
    invoke<void>("write_file", { path, content, encoding: encoding ?? null }),
  createFile: (path: string, content: string) =>
    invoke<void>("create_file", { path, content }),
  createDir: (path: string) => invoke<void>("create_dir", { path }),
  renamePath: (from: string, to: string) =>
    invoke<void>("rename_path", { from, to }),
  deletePath: (path: string) => invoke<void>("delete_path", { path }),
  pathExists: (path: string) => invoke<boolean>("path_exists", { path }),
  getFileMtime: (path: string) => invoke<number | null>("get_file_mtime", { path }),
  setWatchedFile: (path: string | null) =>
    invoke<void>("set_watched_file", { path: path ?? null }),
  savePasteImage: (notePath: string, ext: string, dataBase64?: string, sourcePath?: string) =>
    invoke<string>("save_paste_image", {
      notePath,
      ext,
      dataBase64: dataBase64 ?? null,
      sourcePath: sourcePath ?? null,
    }),
  pickDirectory: () => invoke<string | null>("pick_directory"),
  pickImageFile: () => invoke<string | null>("pick_image_file"),
  saveImageAs: (args: {
    path?: string | null;
    dataBase64?: string | null;
    ext?: string | null;
    suggestedName?: string | null;
  }) =>
    invoke<string | null>("save_image_as", {
      path: args.path ?? null,
      dataBase64: args.dataBase64 ?? null,
      ext: args.ext ?? null,
      suggestedName: args.suggestedName ?? null,
    }),
  copyImageToClipboard: (args: { path?: string | null; dataBase64?: string | null }) =>
    invoke<void>("copy_image_to_clipboard", {
      path: args.path ?? null,
      dataBase64: args.dataBase64 ?? null,
    }),
  getRecentWorkspaces: () => invoke<string[]>("get_recent_workspaces"),
  addRecentWorkspace: (path: string) =>
    invoke<void>("add_recent_workspace", { path }),
  removeRecentWorkspace: (path: string) =>
    invoke<void>("remove_recent_workspace", { path }),
  revealInExplorer: (path: string) =>
    invoke<void>("reveal_in_explorer", { path }),
  /** App version from Cargo.toml (About dialog). */
  appVersion: () => invoke<string>("get_version"),
  /** Open a URL in the system browser. */
  openUrl: (url: string) => invoke<void>("open_url", { url }),
};

/** Join a directory path with a child name, preserving the OS separator style. */
export function joinPath(dir: string, name: string): string {
  const sep = dir.includes("\\") ? "\\" : "/";
  return dir.replace(/[\\/]+$/, "") + sep + name;
}

export function baseName(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : p;
}

const IMAGE_PATH_RE = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;

/** True when the path points at an image file shown in the tree/preview. */
export function isImagePath(p: string): boolean {
  return IMAGE_PATH_RE.test(p);
}

export { convertFileSrc };
