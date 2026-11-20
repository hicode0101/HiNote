import type { EditorView } from "@codemirror/view";
import { undo, redo } from "@codemirror/commands";
import { t } from "./i18n";
import { api } from "./tauri";
import { editor } from "@/stores/editor";

let view: EditorView | null = null;

/** Register/unregister the live CodeMirror view (classic mode only). */
export function registerEditorView(v: EditorView | null): void {
  view = v;
}

function requireView(): EditorView {
  if (!view) throw new Error("editor not ready");
  return view;
}

function focusAndSync(): void {
  if (!view) return;
  view.focus();
  syncFromView();
}

function syncFromView(): void {
  if (!view) return;
  editor.content = view.state.doc.toString();
  editor.dirty = editor.content !== editor.savedContent;
}

/** Wrap the selection (or a placeholder) with the given markers. */
export function wrapSelection(
  before: string,
  after: string = before,
  placeholder = ""
): void {
  const v = requireView();
  const sel = v.state.selection.main;
  const selected = v.state.sliceDoc(sel.from, sel.to);
  const inner = selected || placeholder;
  v.dispatch({
    changes: {
      from: sel.from,
      to: sel.to,
      insert: before + inner + after,
    },
    selection: {
      anchor: sel.from + before.length,
      head: sel.from + before.length + inner.length,
    },
    scrollIntoView: true,
  });
  focusAndSync();
}

function replaceLines(prefixFor: (i: number, count: number) => string): void {
  const v = requireView();
  const sel = v.state.selection.main;
  const fromLine = v.state.doc.lineAt(sel.from);
  const toLine = v.state.doc.lineAt(sel.to);
  const lines: { from: number; to: number; insert: string }[] = [];
  let cursor: { anchor: number } | undefined;
  for (let i = 0, n = fromLine.number; n <= toLine.number; n++, i++) {
    const line = v.state.doc.line(n);
    // Strip an existing heading/quote/list prefix before applying the new one.
    const stripped = line.text.replace(/^\s*(#{1,6}\s|>\s|[-*+]\s\[[ x]\]\s|[-*+]\s|\d+\.\s)/, "");
    const insert = prefixFor(i, toLine.number - fromLine.number + 1) + stripped;
    lines.push({ from: line.from, to: line.to, insert });
    if (i === 0) cursor = { anchor: line.from + insert.length };
  }
  v.dispatch({ changes: lines, selection: cursor, scrollIntoView: true });
  focusAndSync();
}

export function setHeading(level: number): void {
  replaceLines(() => "#".repeat(level) + " ");
}

export function toggleQuote(): void {
  replaceLines(() => "> ");
}

export function bulletList(): void {
  replaceLines(() => "- ");
}

export function numberedList(): void {
  replaceLines((i) => `${i + 1}. `);
}

export function taskList(): void {
  replaceLines(() => "- [ ] ");
}

export function insertBlock(text: string): void {
  const v = requireView();
  const sel = v.state.selection.main;
  const line = v.state.doc.lineAt(sel.to);
  const prefix = line.text.trim() === "" ? "" : "\n";
  v.dispatch({
    changes: {
      from: sel.to,
      to: sel.to,
      insert: prefix + text,
    },
    selection: { anchor: sel.to + prefix.length + text.length },
    scrollIntoView: true,
  });
  focusAndSync();
}

export function insertCodeBlock(): void {
  const lang = "";
  insertBlock("```" + lang + "\n\n```\n");
  // Move cursor inside the fence.
  if (view) {
    const pos = view.state.selection.main.anchor;
    view.dispatch({ selection: { anchor: pos - 5 } });
    view.focus();
    syncFromView();
  }
}

export function insertTable(): void {
  const col = t("toolbar.tableCol");
  const text = `| ${col}1 | ${col}2 | ${col}3 |\n| --- | --- | --- |\n|  |  |  |\n`;
  insertBlock(text);
}

export function insertHorizontalRule(): void {
  insertBlock("\n---\n");
}

export function insertLink(): void {
  wrapSelection("[", "](https://)", "https://");
}

export function doUndo(): void {
  if (!view) return;
  undo(view);
  focusAndSync();
}

export function doRedo(): void {
  if (!view) return;
  redo(view);
  focusAndSync();
}

// ===== Editor context-menu actions (clipboard + selection) =====

/** True when the editor has a non-empty selection. */
export function hasSelection(): boolean {
  if (!view) return false;
  const sel = view.state.selection.main;
  return sel.from !== sel.to;
}

function selectedText(): string {
  if (!view) return "";
  const sel = view.state.selection.main;
  return view.state.sliceDoc(sel.from, sel.to);
}

export function deleteSelection(): void {
  if (!view) return;
  const sel = view.state.selection.main;
  if (sel.from === sel.to) return;
  view.dispatch({
    changes: { from: sel.from, to: sel.to },
    selection: { anchor: sel.from },
  });
  focusAndSync();
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard API unavailable (older webview) — ignore.
  }
}

export async function editorCopy(): Promise<void> {
  const text = selectedText();
  if (text) await copyText(text);
}

export async function editorCut(): Promise<void> {
  const text = selectedText();
  if (!text) return;
  await copyText(text);
  deleteSelection();
}

export async function editorPaste(): Promise<void> {
  let text: string;
  try {
    text = await navigator.clipboard.readText();
  } catch {
    return; // clipboard read denied
  }
  if (text) insertAtCursor(text);
}

export function editorSelectAll(): void {
  if (!view) return;
  view.dispatch({
    selection: { anchor: 0, head: view.state.doc.length },
  });
  view.focus();
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function extFromMime(mime: string): string {
  const sub = mime.split("/")[1] || "png";
  return sub.replace("jpeg", "jpg").replace("svg+xml", "svg");
}

/**
 * Save a pasted image next to the current note and return its relative path.
 */
export async function savePastedImage(file: File): Promise<string | null> {
  if (!editor.path) return null;
  const buf = await file.arrayBuffer();
  const b64 = arrayBufferToBase64(buf);
  const ext = file.type.startsWith("image/")
    ? extFromMime(file.type)
    : (file.name.split(".").pop() || "png").toLowerCase();
  return api.savePasteImage(editor.path, ext, b64);
}

export function insertAtCursor(text: string): void {
  const v = requireView();
  const pos = v.state.selection.main.to;
  v.dispatch({
    changes: { from: pos, to: pos, insert: text },
    selection: { anchor: pos + text.length },
    scrollIntoView: true,
  });
  focusAndSync();
}

/** Replace the whole document (JSON/XML formatting), keeping undo history. */
export function replaceAllText(text: string): void {
  const v = requireView();
  v.dispatch({
    changes: { from: 0, to: v.state.doc.length, insert: text },
    selection: { anchor: Math.min(text.length, v.state.selection.main.anchor) },
    scrollIntoView: true,
  });
  focusAndSync();
}
