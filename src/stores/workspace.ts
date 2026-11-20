import { reactive } from "vue";
import { api, baseName, TreeNode, isImagePath } from "@/lib/tauri";
import { t } from "@/lib/i18n";
import { displayUrl } from "@/lib/imgSrc";
import { settings, persistSettings } from "./settings";
import { editor, flushSave, openFile, closeFile } from "./editor";
import { confirmDialog } from "./dialog";
import { openImagePreview } from "./imgpreview";

export const workspace = reactive({
  tree: [] as TreeNode[],
  expanded: new Set<string>(),
  activePath: null as string | null,
  filter: "",
  loading: false,
  error: null as string | null,
  /** Recently opened workspace dirs, most recent first (missing dirs filtered out). */
  recents: [] as string[],
});

export async function refreshTree(): Promise<void> {
  if (!settings.workspace) {
    workspace.tree = [];
    return;
  }
  workspace.loading = true;
  workspace.error = null;
  try {
    workspace.tree = await api.readTree(settings.workspace);
  } catch {
    workspace.tree = [];
    workspace.error = "workspace_missing";
  }
  workspace.loading = false;
}

/**
 * Open a workspace as the current session workspace. On success the dir is
 * recorded in recent_workspaces.json. Callers should fall back to the welcome
 * screen when `workspace.error` is set afterwards.
 */
export async function chooseWorkspace(dir: string | null): Promise<void> {
  if (!dir) {
    settings.workspace = null;
    return;
  }
  settings.workspace = dir;
  await persistSettings();
  // Flush + close the previous doc (also clears the watched file).
  await closeFile();
  workspace.expanded.clear();
  workspace.filter = ""; // 同时清空侧边栏搜索状态
  workspace.activePath = null;
  try {
    await api.setSessionWorkspace(dir);
  } catch {
    // Outside Tauri there is no backend; tree reading will still fail.
  }
  await refreshTree();
  if (!workspace.error) {
    try {
      await api.addRecentWorkspace(dir);
      await loadRecents();
    } catch {
      // Recents are best-effort; ignore persistence failures.
    }
  }
}

export async function loadRecents(): Promise<void> {
  try {
    workspace.recents = await api.getRecentWorkspaces();
  } catch {
    // Outside Tauri the list stays empty.
  }
}

export async function removeRecent(path: string): Promise<void> {
  try {
    await api.removeRecentWorkspace(path);
  } catch {
    // Ignore.
  }
  workspace.recents = workspace.recents.filter(
    (p) => p.toLowerCase() !== path.toLowerCase()
  );
}

export function toggleExpand(path: string): void {
  if (workspace.expanded.has(path)) {
    workspace.expanded.delete(path);
  } else {
    workspace.expanded.add(path);
  }
}

/** Ensure a directory is expanded (used after creating children inside it). */
export function expandPath(path: string): void {
  workspace.expanded.add(path);
}

/** Sibling list (within the same tree folder) containing `path`, if any. */
function findSiblingList(nodes: TreeNode[], path: string): TreeNode[] | null {
  const lower = path.toLowerCase();
  for (const node of nodes) {
    if (node.path.toLowerCase() === lower) return nodes;
    const found = findSiblingList(node.children, path);
    if (found) return found;
  }
  return null;
}

/** Open an image file from the tree in the gallery preview. */
function previewImageFile(path: string): void {
  const siblings = findSiblingList(workspace.tree, path);
  const images = (siblings ?? [])
    .filter((n) => n.kind === "file" && isImagePath(n.path))
    .map((n) => ({ url: displayUrl(n.path), absPath: n.path, name: n.name }));
  const index = images.findIndex((img) => img.absPath.toLowerCase() === path.toLowerCase());
  openImagePreview(images, Math.max(index, 0));
}

/**
 * Resolve unsaved edits before leaving the current file: autosave on → save
 * silently and proceed; autosave off → ask first. Returns false when the
 * user dismissed the dialog (stay on the current file).
 */
async function settleUnsaved(): Promise<boolean> {
  if (!(editor.dirty && editor.path)) return true;
  if (settings.autosave) {
    await flushSave();
    return true;
  }
  const save = await confirmDialog({
    title: t("dialog.unsavedTitle"),
    message: t("dialog.unsavedBody", { name: baseName(editor.path) }),
    okText: t("dialog.save"),
    cancelText: t("dialog.dontSave"),
  });
  if (save === null) return false; // dismissed — stay on the current file
  if (save) {
    await flushSave();
  } else {
    editor.dirty = false; // discard pending edits
  }
  return true;
}

export async function activateFile(path: string): Promise<void> {
  if (isImagePath(path)) {
    previewImageFile(path);
    return;
  }
  // Switching to a different file while the current one has unsaved edits:
  // autosave on → save silently and proceed; autosave off → ask first.
  if (editor.path && editor.path.toLowerCase() !== path.toLowerCase()) {
    if (!(await settleUnsaved())) return;
  }
  await openFile(path);
  workspace.activePath = path;
}

/** Close button: leave the editor view and return to the empty state. */
export async function closeActiveFile(): Promise<void> {
  if (!(await settleUnsaved())) return;
  await closeFile();
  workspace.activePath = null;
}

export function removeOpenStateIfDeleted(path: string): void {
  if (workspace.activePath === path) workspace.activePath = null;
  void closeFile();
}
