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

/** Editor context menu: full menu, clipboard-only (preview), or fluid
 * WYSIWYG (copy/paste/rule/delete). */
export interface EditorMenuState extends FloatingMenuState {
  clipboardOnly: boolean;
  /** Paste enabled (fluid editable) vs disabled (read-only preview). */
  canPaste: boolean;
  /** Fluid WYSIWYG menu layout (copy/paste/rule/delete). */
  fluid: boolean;
  /** Something to delete: image under the cursor or a DOM selection. */
  hasDelete: boolean;
}

export const ui = reactive({
  settingsOpen: false,
  aboutOpen: false,
  contextMenu: { visible: false, x: 0, y: 0, node: null } as ContextMenuState,
  /** Right-click menu inside the editor area (formatting/clipboard). */
  editorMenu: {
    visible: false,
    x: 0,
    y: 0,
    clipboardOnly: false,
    canPaste: false,
    fluid: false,
    hasDelete: false,
  } as EditorMenuState,
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

export function openEditorMenu(
  x: number,
  y: number,
  opts: { clipboardOnly?: boolean; canPaste?: boolean; fluid?: boolean; hasDelete?: boolean } = {}
): void {
  ui.contextMenu.visible = false;
  ui.editorMenu.visible = true;
  ui.editorMenu.x = x;
  ui.editorMenu.y = y;
  ui.editorMenu.clipboardOnly = !!opts.clipboardOnly;
  ui.editorMenu.canPaste = !!opts.canPaste;
  ui.editorMenu.fluid = !!opts.fluid;
  ui.editorMenu.hasDelete = !!opts.hasDelete;
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
