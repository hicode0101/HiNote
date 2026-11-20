<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { t } from "@/lib/i18n";
import { ui, closeContextMenu, closeEditorMenu } from "@/stores/ui";
import { editor, reloadActiveFile } from "@/stores/editor";
import { settings } from "@/stores/settings";
import { refreshTree } from "@/stores/workspace";
import { createDocument, createFolder, renameNode, deleteNode, revealNode } from "@/lib/ops";
import { formatDocument } from "@/lib/formatActions";
import { langForPath } from "@/lib/languages";
import {
  doUndo, doRedo, editorCut, editorCopy, editorPaste, editorSelectAll,
  hasSelection, deleteSelectionCheckingImage, transformUpper, transformLower,
  transformCapitalize, copySelectionText, pasteFromClipboardIntoActive,
  fluidDeleteSelection,
} from "@/lib/markdownActions";
import Icon from "./Icon.vue";

const menuEl = ref<HTMLElement | null>(null);
const pos = ref({ x: 0, y: 0 });
const editorMenuEl = ref<HTMLElement | null>(null);
const editorPos = ref({ x: 0, y: 0 });

const target = computed(() => ui.contextMenu.node);

interface MenuItem {
  key: string;
  label: string;
  icon: string;
  danger?: boolean;
  separator?: boolean;
  action: () => void;
}

const items = computed<MenuItem[]>(() => {
  const node = target.value;
  if (!node) {
    // Workspace root
    return [
      { key: "newDoc", label: t("menu.newDoc"), icon: "documentPlus", action: () => createDocument(settings.workspace!, "md") },
      { key: "newText", label: t("menu.newText"), icon: "note", action: () => createDocument(settings.workspace!, "txt") },
      { key: "newFolder", label: t("menu.newFolder"), icon: "folderPlus", action: () => createFolder(settings.workspace!) },
      { key: "reveal", label: t("menu.reveal"), icon: "open", action: () => revealNode(null) },
      { key: "sep1", label: "", icon: "", separator: true, action: () => undefined },
      { key: "refresh", label: t("menu.refresh"), icon: "refresh", action: () => void refreshTree() },
    ];
  }
  if (node.kind === "dir") {
    return [
      { key: "newDoc", label: t("menu.newDoc"), icon: "documentPlus", action: () => createDocument(node.path, "md") },
      { key: "newText", label: t("menu.newText"), icon: "note", action: () => createDocument(node.path, "txt") },
      { key: "newFolder", label: t("menu.newFolder"), icon: "folderPlus", action: () => createFolder(node.path) },
      { key: "rename", label: t("menu.rename"), icon: "edit", action: () => renameNode(node) },
      { key: "reveal", label: t("menu.reveal"), icon: "open", action: () => revealNode(node) },
      { key: "sep1", label: "", icon: "", separator: true, action: () => undefined },
      { key: "refresh", label: t("menu.refresh"), icon: "refresh", action: () => void refreshTree() },
      { key: "sep2", label: "", icon: "", separator: true, action: () => undefined },
      { key: "delete", label: t("menu.delete"), icon: "delete", danger: true, action: () => deleteNode(node) },
    ];
  }
  return [
    { key: "rename", label: t("menu.rename"), icon: "edit", action: () => renameNode(node) },
    { key: "reveal", label: t("menu.reveal"), icon: "open", action: () => revealNode(node) },
    { key: "sep1", label: "", icon: "", separator: true, action: () => undefined },
    { key: "refresh", label: t("menu.refresh"), icon: "refresh", action: () => void refreshTree() },
    { key: "sep2", label: "", icon: "", separator: true, action: () => undefined },
    { key: "delete", label: t("menu.delete"), icon: "delete", danger: true, action: () => deleteNode(node) },
  ];
});

const MENU_WIDTH = 220;
const MENU_HEIGHT_EST = 44 * 6 + 16;

// ===== Editor context menu — same structure as HiEditor's Edit menu =====
// 撤销/恢复、剪贴板、大小写转换、格式化子菜单（json/xml）、重新加载文件。
interface EditorMenuItem {
  key: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  separator?: boolean;
  submenu?: EditorMenuItem[];
  action: () => void | Promise<void>;
}

function sep(key: string): EditorMenuItem {
  return { key, label: "", separator: true, action: () => undefined };
}

const editorItems = computed<EditorMenuItem[]>(() => {
  // Fluid WYSIWYG menu: copy/paste + delete (deleting an image additionally
  // offers to remove its workspace file). Recomputed on every open so the
  // DOM-selection state is fresh.
  if (ui.editorMenu.fluid) {
    const sel = window.getSelection()?.toString() ?? "";
    return [
      { key: "copy", label: t("editmenu.copy"), shortcut: "Ctrl+C", disabled: !sel, action: () => void copySelectionText() },
      { key: "paste", label: t("editmenu.paste"), shortcut: "Ctrl+V", action: () => void pasteFromClipboardIntoActive() },
      sep("sep1"),
      { key: "delete", label: t("editmenu.delete"), shortcut: "Del", disabled: !ui.editorMenu.hasDelete, action: () => fluidDeleteSelection() },
    ];
  }
  // Clipboard-only menu (preview pane: copy enabled, paste grayed). Recomputed
  // on every open so the DOM-selection state is fresh.
  if (ui.editorMenu.clipboardOnly) {
    const sel = window.getSelection()?.toString() ?? "";
    return [
      { key: "copy", label: t("editmenu.copy"), shortcut: "Ctrl+C", disabled: !sel, action: () => void copySelectionText() },
      { key: "paste", label: t("editmenu.paste"), shortcut: "Ctrl+V", disabled: !ui.editorMenu.canPaste, action: () => void pasteFromClipboardIntoActive() },
    ];
  }
  const hasSel = hasSelection();
  const lang = langForPath(editor.path);
  const formattable = lang === "json" || lang === "xml";
  // 与 EditorClassic 的快捷键一致：json 用 J，xml 用 L
  const [prettyKey, minifyKey] =
    lang === "xml"
      ? ["Ctrl+Shift+L", "Ctrl+Alt+L"]
      : ["Ctrl+Shift+J", "Ctrl+Alt+J"];
  return [
    { key: "undo", label: t("editmenu.undo"), shortcut: "Ctrl+Z", action: () => doUndo() },
    { key: "redo", label: t("editmenu.redo"), shortcut: "Ctrl+Y", action: () => doRedo() },
    sep("sep1"),
    { key: "selectAll", label: t("editmenu.selectAll"), shortcut: "Ctrl+A", action: () => editorSelectAll() },
    { key: "cut", label: t("editmenu.cut"), shortcut: "Ctrl+X", disabled: !hasSel, action: () => void editorCut() },
    { key: "copy", label: t("editmenu.copy"), shortcut: "Ctrl+C", disabled: !hasSel, action: () => void editorCopy() },
    { key: "paste", label: t("editmenu.paste"), shortcut: "Ctrl+V", action: () => void editorPaste() },
    { key: "delete", label: t("editmenu.delete"), shortcut: "Del", disabled: !hasSel, action: () => void deleteSelectionCheckingImage() },
    sep("sep2"),
    { key: "upper", label: t("editmenu.upper"), disabled: !hasSel, action: () => transformUpper() },
    { key: "lower", label: t("editmenu.lower"), disabled: !hasSel, action: () => transformLower() },
    { key: "capitalize", label: t("editmenu.capitalize"), disabled: !hasSel, action: () => transformCapitalize() },
    sep("sep3"),
    {
      key: "format",
      label: t("editmenu.format"),
      disabled: !formattable,
      submenu: [
        { key: "formatPretty", label: t("editmenu.format"), shortcut: prettyKey, action: () => void formatDocument(false) },
        { key: "formatMinify", label: t("editmenu.minify"), shortcut: minifyKey, action: () => void formatDocument(true) },
      ],
      action: () => undefined,
    },
    sep("sep4"),
    {
      key: "reload",
      label: t("editmenu.reloadFile"),
      disabled: !editor.path,
      action: () => void reloadActiveFile(),
    },
  ];
});

const EDITOR_MENU_HEIGHT_EST = 28 * 16 + 16;

// Hover flyout for the 格式化 submenu (fixed-position so the scrollable
// editor menu doesn't clip it).
const openSub = ref<{ items: EditorMenuItem[]; x: number; y: number } | null>(null);

function onEditorItemEnter(item: EditorMenuItem, ev: MouseEvent): void {
  if (!item.submenu || item.disabled) {
    openSub.value = null;
    return;
  }
  const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
  openSub.value = {
    items: item.submenu,
    x: Math.min(r.right - 3, window.innerWidth - MENU_WIDTH - 8),
    y: Math.min(r.top - 5, window.innerHeight - 100),
  };
}

function runEditor(item: EditorMenuItem): void {
  if (item.separator || item.disabled || item.submenu) return;
  closeEditorMenu();
  void item.action();
}

function runSub(item: EditorMenuItem): void {
  if (item.separator || item.disabled) return;
  openSub.value = null;
  closeEditorMenu();
  void item.action();
}

watch(
  () => ui.contextMenu.visible,
  async (visible) => {
    if (visible) {
      await nextTick();
      const h = menuEl.value?.offsetHeight ?? MENU_HEIGHT_EST;
      pos.value = {
        x: Math.min(ui.contextMenu.x, window.innerWidth - MENU_WIDTH - 8),
        y: Math.min(ui.contextMenu.y, window.innerHeight - h - 8),
      };
    }
  }
);

watch(
  () => ui.editorMenu.visible,
  async (visible) => {
    if (visible) {
      await nextTick();
      const h = editorMenuEl.value?.offsetHeight ?? EDITOR_MENU_HEIGHT_EST;
      editorPos.value = {
        x: Math.min(ui.editorMenu.x, window.innerWidth - MENU_WIDTH - 8),
        y: Math.min(ui.editorMenu.y, window.innerHeight - h - 8),
      };
    } else {
      openSub.value = null;
    }
  }
);

function run(item: MenuItem): void {
  if (item.separator) return;
  closeContextMenu();
  item.action();
}

function onDocMouseDown(e: MouseEvent): void {
  if (ui.contextMenu.visible) {
    if (menuEl.value && e.target instanceof Node && menuEl.value.contains(e.target)) return;
    closeContextMenu();
  }
  if (ui.editorMenu.visible) {
    if (editorMenuEl.value && e.target instanceof Node && editorMenuEl.value.contains(e.target)) return;
    closeEditorMenu();
  }
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    if (ui.contextMenu.visible) closeContextMenu();
    if (ui.editorMenu.visible) closeEditorMenu();
  }
}

onMounted(() => {
  document.addEventListener("mousedown", onDocMouseDown, true);
  document.addEventListener("keydown", onKeydown);
});
onUnmounted(() => {
  document.removeEventListener("mousedown", onDocMouseDown, true);
  document.removeEventListener("keydown", onKeydown);
});
</script>

<template>
  <Teleport to="body">
    <transition name="pop">
      <div
        v-if="ui.contextMenu.visible"
        ref="menuEl"
        class="ctx-menu"
        :style="{ left: pos.x + 'px', top: pos.y + 'px' }"
      >
        <template v-for="item in items" :key="item.key">
          <div v-if="item.separator" class="ctx-sep"></div>
          <button
            v-else
            class="ctx-item"
            :class="{ danger: item.danger }"
            @click="run(item)"
          >
            <Icon :name="item.icon" :size="16" class="ctx-icon" />
            <span>{{ item.label }}</span>
          </button>
        </template>
      </div>
    </transition>

    <transition name="pop">
      <div
        v-if="ui.editorMenu.visible"
        ref="editorMenuEl"
        class="ctx-menu editor-menu"
        :style="{ left: editorPos.x + 'px', top: editorPos.y + 'px' }"
      >
        <template v-for="item in editorItems" :key="item.key">
          <div v-if="item.separator" class="ctx-sep"></div>
          <button
            v-else
            class="ctx-item editor-item"
            :class="{ disabled: item.disabled, 'has-sub': item.submenu && !item.disabled }"
            :disabled="item.disabled"
            @click="runEditor(item)"
            @mouseenter="onEditorItemEnter(item, $event)"
          >
            <span class="ctx-label">{{ item.label }}</span>
            <span v-if="item.shortcut" class="ctx-shortcut">{{ item.shortcut }}</span>
            <Icon v-else-if="item.submenu" name="chevronRight" :size="14" class="ctx-arrow" />
          </button>
        </template>
      </div>
    </transition>

    <transition name="pop">
      <div
        v-if="ui.editorMenu.visible && openSub"
        class="ctx-menu editor-submenu"
        :style="{ left: openSub.x + 'px', top: openSub.y + 'px' }"
      >
        <template v-for="item in openSub.items" :key="item.key">
          <div v-if="item.separator" class="ctx-sep"></div>
          <button
            v-else
            class="ctx-item editor-item"
            :class="{ disabled: item.disabled }"
            :disabled="item.disabled"
            @click="runSub(item)"
          >
            <span class="ctx-label">{{ item.label }}</span>
            <span v-if="item.shortcut" class="ctx-shortcut">{{ item.shortcut }}</span>
          </button>
        </template>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
.ctx-menu {
  position: fixed;
  z-index: 1000;
  width: 220px;
  padding: 5px;
  border: 1px solid var(--stroke);
  border-radius: var(--radius-md);
  background: var(--bg-layer);
  backdrop-filter: blur(30px) saturate(1.4);
  box-shadow: var(--shadow-flyout);
  transform-origin: top left;
}

.ctx-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: 34px;
  padding: 0 10px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: background 0.1s ease;
}
.ctx-item:hover {
  background: var(--bg-hover);
}
.ctx-item:active {
  background: var(--bg-active);
}
.ctx-item.danger {
  color: var(--danger);
}
.ctx-item.disabled {
  opacity: 0.45;
  cursor: default;
}
.ctx-item.disabled:hover {
  background: transparent;
}
.ctx-item.disabled .ctx-icon {
  color: var(--text-tertiary);
}

/* Editor menu is taller (many markdown entries): keep it scrollable. */
.editor-menu {
  max-height: calc(100vh - 24px);
  overflow-y: auto;
}
.ctx-icon {
  color: var(--accent);
}
.ctx-item.danger .ctx-icon {
  color: var(--danger);
}

/* Editor items: HiEditor style — plain label + right-aligned shortcut. */
.editor-item {
  justify-content: space-between;
  gap: 24px;
}
.editor-item .ctx-label {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ctx-shortcut {
  flex-shrink: 0;
  font-size: 11.5px;
  color: var(--text-tertiary);
}
.editor-item.has-sub .ctx-label {
  color: var(--text-primary);
}
.ctx-arrow {
  flex-shrink: 0;
  color: var(--text-tertiary);
}

.editor-submenu {
  width: 220px;
  padding: 5px;
}

.ctx-sep {
  height: 1px;
  margin: 5px 8px;
  background: var(--stroke);
}
</style>
