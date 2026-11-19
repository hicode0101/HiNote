import { invoke, convertFileSrc } from "@tauri-apps/api/core";

export interface TreeNode {
  name: string;
  path: string;
  kind: "dir" | "file";
  children: TreeNode[];
}

export interface AppConfig {
  images_dir: string;
  language: string;
  theme: string;
  editor_mode: string;
}

/** True when running inside the Tauri webview (vs. a plain browser). */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export const api = {
  getConfig: () => invoke<AppConfig>("get_config"),
  saveConfig: (config: AppConfig) => invoke<void>("save_config", { config }),
  readTree: (root: string) => invoke<TreeNode[]>("read_tree", { root }),
  setSessionWorkspace: (path: string) =>
    invoke<void>("set_session_workspace", { path }),
  readFile: (path: string) => invoke<string>("read_file", { path }),
  writeFile: (path: string, content: string) =>
    invoke<void>("write_file", { path, content }),
  createFile: (path: string, content: string) =>
    invoke<void>("create_file", { path, content }),
  createDir: (path: string) => invoke<void>("create_dir", { path }),
  renamePath: (from: string, to: string) =>
    invoke<void>("rename_path", { from, to }),
  deletePath: (path: string) => invoke<void>("delete_path", { path }),
  pathExists: (path: string) => invoke<boolean>("path_exists", { path }),
  savePasteImage: (notePath: string, ext: string, dataBase64?: string, sourcePath?: string) =>
    invoke<string>("save_paste_image", {
      notePath,
      ext,
      dataBase64: dataBase64 ?? null,
      sourcePath: sourcePath ?? null,
    }),
  pickDirectory: () => invoke<string | null>("pick_directory"),
  pickImageFile: () => invoke<string | null>("pick_image_file"),
  getRecentWorkspaces: () => invoke<string[]>("get_recent_workspaces"),
  addRecentWorkspace: (path: string) =>
    invoke<void>("add_recent_workspace", { path }),
  removeRecentWorkspace: (path: string) =>
    invoke<void>("remove_recent_workspace", { path }),
  revealInExplorer: (path: string) =>
    invoke<void>("reveal_in_explorer", { path }),
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

export { convertFileSrc };
