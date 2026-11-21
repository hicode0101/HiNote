import { reactive, watch } from "vue";
import { api, baseName } from "@/lib/tauri";
import { langForPath } from "@/lib/languages";
import { t } from "@/lib/i18n";
import { settings } from "./settings";
import { confirmDialog, dialogState } from "./dialog";
import { ui } from "./ui";

export const editor = reactive({
  path: null as string | null,
  content: "",
  savedContent: "",
  dirty: false,
  saving: false,
  /** Classic-mode sub-view: edit / split (分屏编辑) / preview. */
  view: "edit" as "edit" | "split" | "preview",
  cursor: { line: 1, col: 1 },
  /** Bumped on every open/close/reload so async editor callbacks can detect staleness. */
  generation: 0,
  /** Disk mtime of the last read/write; the external-change baseline. */
  savedMtime: null as number | null,
  /** Encoding key detected at open time; reused on save to preserve it. */
  encoding: "utf8" as string,
  /** Human-readable label shown in the status bar. */
  encodingLabel: "" as string,
});

let saveTimer: ReturnType<typeof setTimeout> | null = null;

async function readMtime(path: string): Promise<number | null> {
  try {
    return await api.getFileMtime(path);
  } catch {
    return null;
  }
}

/** Current file is a Markdown note (preview / split eligible). */
export function isMarkdownFile(): boolean {
  return langForPath(editor.path) === "md";
}

/** Current file is a PDF opened in the read-only viewer. */
export function isPdfFile(): boolean {
  return langForPath(editor.path) === "pdf";
}

export async function openFile(path: string): Promise<void> {
  await flushSave();
  // PDF: binary — do not run through text decoding; the viewer reads it itself.
  if (langForPath(path) === "pdf") {
    editor.generation++;
    editor.path = path;
    editor.content = "";
    editor.savedContent = "";
    editor.dirty = false;
    editor.view = "edit";
    editor.cursor = { line: 1, col: 1 };
    editor.savedMtime = await readMtime(path);
    editor.encoding = "utf8";
    editor.encodingLabel = "";
    api.setWatchedFile(path).catch(() => {});
    return;
  }
  try {
    const out = await api.readFile(path);
    editor.generation++;
    editor.path = path;
    editor.content = out.text;
    editor.savedContent = out.text;
    editor.dirty = false;
    editor.view = "edit";
    editor.cursor = { line: 1, col: 1 };
    editor.savedMtime = await readMtime(path);
    editor.encoding = out.encoding;
    editor.encodingLabel = out.encoding_label;
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
  editor.encoding = "utf8";
  editor.encodingLabel = "";
  api.setWatchedFile(null).catch(() => {});
}

export function onContentChange(content: string): void {
  editor.content = content;
  editor.dirty = content !== editor.savedContent;
  if (settings.autosave) scheduleSave();
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void flushSave();
  }, 600);
}

// Turning autosave off cancels a pending debounced save (edits stay dirty
// until Ctrl+S or the switch-file confirmation).
watch(
  () => settings.autosave,
  (on) => {
    if (!on && saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
  }
);

export async function flushSave(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (!editor.path || !editor.dirty) return;
  if (langForPath(editor.path) === "pdf") return; // read-only viewer, never written
  editor.saving = true;
  try {
    await api.writeFile(editor.path, editor.content, editor.encoding);
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
    const out = await api.readFile(path);
    editor.generation++;
    editor.content = out.text;
    editor.savedContent = out.text;
    editor.dirty = false;
    editor.savedMtime = await readMtime(path);
    editor.encoding = out.encoding;
    editor.encodingLabel = out.encoding_label;
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
  if (isPdfFile()) return; // read-only viewer keeps its own loaded copy
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
