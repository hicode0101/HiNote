import { reactive } from "vue";
import { api, baseName } from "@/lib/tauri";
import { t } from "@/lib/i18n";
import { confirmDialog, dialogState } from "./dialog";
import { ui } from "./ui";

export const editor = reactive({
  path: null as string | null,
  content: "",
  savedContent: "",
  dirty: false,
  saving: false,
  /** Classic-mode sub-view, mirroring the 编辑/预览 tabs. */
  view: "edit" as "edit" | "preview",
  cursor: { line: 1, col: 1 },
  /** Bumped on every open/close/reload so async editor callbacks can detect staleness. */
  generation: 0,
  /** Disk mtime of the last read/write; the external-change baseline. */
  savedMtime: null as number | null,
});

let saveTimer: ReturnType<typeof setTimeout> | null = null;

async function readMtime(path: string): Promise<number | null> {
  try {
    return await api.getFileMtime(path);
  } catch {
    return null;
  }
}

export async function openFile(path: string): Promise<void> {
  await flushSave();
  try {
    const content = await api.readFile(path);
    editor.generation++;
    editor.path = path;
    editor.content = content;
    editor.savedContent = content;
    editor.dirty = false;
    editor.view = "edit";
    editor.cursor = { line: 1, col: 1 };
    editor.savedMtime = await readMtime(path);
    api.setWatchedFile(path).catch(() => {});
  } catch {
    // Keep the previous state; the tree item may be stale.
  }
}

export async function closeFile(): Promise<void> {
  await flushSave();
  editor.generation++;
  editor.path = null;
  editor.content = "";
  editor.savedContent = "";
  editor.dirty = false;
  editor.savedMtime = null;
  api.setWatchedFile(null).catch(() => {});
}

export function onContentChange(content: string): void {
  editor.content = content;
  editor.dirty = content !== editor.savedContent;
  scheduleSave();
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void flushSave();
  }, 600);
}

export async function flushSave(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (!editor.path || !editor.dirty) return;
  editor.saving = true;
  try {
    await api.writeFile(editor.path, editor.content);
    editor.savedContent = editor.content;
    editor.dirty = false;
    editor.savedMtime = await readMtime(editor.path);
  } finally {
    editor.saving = false;
  }
}

/** Replace the document wholesale with the current disk contents. */
export async function reloadFromDisk(): Promise<void> {
  if (!editor.path) return;
  const path = editor.path;
  try {
    const content = await api.readFile(path);
    editor.generation++;
    editor.content = content;
    editor.savedContent = content;
    editor.dirty = false;
    editor.savedMtime = await readMtime(path);
  } catch {
    // File may have been deleted; keep the current state.
  }
}

/** Right-click menu "reload file": confirm first when there are unsaved edits. */
export async function reloadActiveFile(): Promise<void> {
  if (!editor.path) return;
  if (editor.dirty) {
    const ok = await confirmDialog({
      title: t("dialog.reloadConfirmTitle"),
      message: t("dialog.reloadConfirmBody", { name: baseName(editor.path) }),
      danger: true,
    });
    if (!ok) return;
  }
  await reloadFromDisk();
}

// ===== External change watch (event-driven) =====
// The Rust FS watcher emits "file-changed" when the open note is touched on
// disk (already debounced). We then compare the disk mtime against the
// baseline: our own saves update the baseline, so only genuine external
// changes reach the confirm dialog. Reload discards unsaved edits; cancel
// adopts the new disk version so the same change won't re-prompt.

let watchBusy = false;

export async function handleFileChangedEvent(): Promise<void> {
  if (watchBusy || dialogState.visible || ui.settingsOpen) return;
  if (!document.hasFocus()) return; // not in the foreground = user isn't looking
  if (!editor.path || editor.saving) return;
  const path = editor.path;
  const mtime = await readMtime(path);
  if (mtime === null) return; // deleted/inaccessible: stay silent
  if (editor.savedMtime == null) {
    editor.savedMtime = mtime; // no baseline yet (session restore): snapshot only
    return;
  }
  if (mtime === editor.savedMtime) return; // our own save
  watchBusy = true;
  try {
    const name = baseName(path);
    const ok = await confirmDialog({
      title: t("dialog.fileChangedTitle"),
      message: editor.dirty
        ? t("dialog.fileChangedDirtyBody", { name })
        : t("dialog.fileChangedBody", { name }),
      danger: editor.dirty,
    });
    if (ok) await reloadFromDisk();
    else editor.savedMtime = mtime;
  } finally {
    watchBusy = false;
  }
}
