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

/** Editor context menu: full menu (editor) or clipboard-only (preview). */
export interface EditorMenuState extends FloatingMenuState {
  clipboardOnly: boolean;
  /** Paste enabled (editable editor) vs disabled (read-only preview). */
  canPaste: boolean;
  /** 预览右键命中图片（“删除图片”菜单可点）。 */
  onImage: boolean;
  /** 命中的本地图片绝对路径（工作区物理删除确认用）；外部图片为 null。 */
  imageFile: string | null;
  /** 预览 DOM 上的原始 src（外部图片按字面量匹配文档引用）。 */
  imageSrc: string | null;
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
    onImage: false,
    imageFile: null,
    imageSrc: null,
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
  opts: {
    clipboardOnly?: boolean;
    canPaste?: boolean;
    onImage?: boolean;
    imageFile?: string | null;
    imageSrc?: string | null;
  } = {}
): void {
  ui.contextMenu.visible = false;
  ui.editorMenu.visible = true;
  ui.editorMenu.x = x;
  ui.editorMenu.y = y;
  ui.editorMenu.clipboardOnly = !!opts.clipboardOnly;
  ui.editorMenu.canPaste = !!opts.canPaste;
  ui.editorMenu.onImage = !!opts.onImage;
  ui.editorMenu.imageFile = opts.imageFile ?? null;
  ui.editorMenu.imageSrc = opts.imageSrc ?? null;
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
