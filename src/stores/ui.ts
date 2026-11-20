import { reactive } from "vue";

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  /** Right-clicked node; null means the workspace root. */
  node: { name: string; path: string; kind: "dir" | "file" } | null;
}

interface FloatingMenuState {
  visible: boolean;
  x: number;
  y: number;
}

export const ui = reactive({
  settingsOpen: false,
  aboutOpen: false,
  contextMenu: { visible: false, x: 0, y: 0, node: null } as ContextMenuState,
  /** Right-click menu inside the editor area (formatting/clipboard). */
  editorMenu: { visible: false, x: 0, y: 0 } as FloatingMenuState,
});

export function openContextMenu(
  x: number,
  y: number,
  node: ContextMenuState["node"]
): void {
  ui.editorMenu.visible = false;
  ui.contextMenu.visible = true;
  ui.contextMenu.x = x;
  ui.contextMenu.y = y;
  ui.contextMenu.node = node;
}

export function closeContextMenu(): void {
  ui.contextMenu.visible = false;
}

export function openEditorMenu(x: number, y: number): void {
  ui.contextMenu.visible = false;
  ui.editorMenu.visible = true;
  ui.editorMenu.x = x;
  ui.editorMenu.y = y;
}

export function closeEditorMenu(): void {
  ui.editorMenu.visible = false;
}

// ===== Global toast (bottom-right, e.g. formatter results) =====

export const toast = reactive({ text: "", visible: false });

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export function showToast(text: string, ms = 2600): void {
  toast.text = text;
  toast.visible = true;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.visible = false;
  }, ms);
}
