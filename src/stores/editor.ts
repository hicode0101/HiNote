import { reactive } from "vue";
import { api } from "@/lib/tauri";

export const editor = reactive({
  path: null as string | null,
  content: "",
  savedContent: "",
  dirty: false,
  saving: false,
  /** Classic-mode sub-view, mirroring the 编辑/预览 tabs. */
  view: "edit" as "edit" | "preview",
  cursor: { line: 1, col: 1 },
  /** Bumped on every open/close so async editor callbacks can detect staleness. */
  generation: 0,
});

let saveTimer: ReturnType<typeof setTimeout> | null = null;

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
  } catch {
    // Keep the previous state; the tree item may be slow.
  }
}

export async function closeFile(): Promise<void> {
  await flushSave();
  editor.generation++;
  editor.path = null;
  editor.content = "";
  editor.savedContent = "";
  editor.dirty = false;
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
  } finally {
    editor.saving = false;
  }
}
