import { reactive } from "vue";

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  /** Right-clicked node; null means the workspace root. */
  node: { name: string; path: string; kind: "dir" | "file" } | null;
}

export const ui = reactive({
  settingsOpen: false,
  contextMenu: { visible: false, x: 0, y: 0, node: null } as ContextMenuState,
});

export function openContextMenu(
  x: number,
  y: number,
  node: ContextMenuState["node"]
): void {
  ui.contextMenu.visible = true;
  ui.contextMenu.x = x;
  ui.contextMenu.y = y;
  ui.contextMenu.node = node;
}

export function closeContextMenu(): void {
  ui.contextMenu.visible = false;
}
