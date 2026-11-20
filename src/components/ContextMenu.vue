<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { t } from "@/lib/i18n";
import { ui, closeContextMenu, closeEditorMenu } from "@/stores/ui";
import { editor, reloadActiveFile } from "@/stores/editor";
import { settings } from "@/stores/settings";
import { refreshTree } from "@/stores/workspace";
import { createDocument, createFolder, renameNode, deleteNode, revealNode } from "@/lib/ops";
import {
  doUndo, doRedo, editorCut, editorCopy, editorPaste, editorSelectAll,
  hasSelection, wrapSelection, setHeading, toggleQuote,
  bulletList, numberedList, taskList, insertCodeBlock, insertLink,
  insertTable, insertHorizontalRule,
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
      { key: "newDoc", label: t("menu.newDoc"), icon: "documentPlus", action: () => createDocument(settings.workspace!) },
      { key: "newFolder", label: t("menu.newFolder"), icon: "folderPlus", action: () => createFolder(settings.workspace!) },
      { key: "reveal", label: t("menu.reveal"), icon: "open", action: () => revealNode(null) },
      { key: "sep1", label: "", icon: "", separator: true, action: () => undefined },
      { key: "refresh", label: t("menu.refresh"), icon: "refresh", action: () => void refreshTree() },
    ];
  }
  if (node.kind === "dir") {
    return [
      { key: "newDoc", label: t("menu.newDoc"), icon: "documentPlus", action: () => createDocument(node.path) },
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

// ===== Editor context menu items (formatting + clipboard, classic mode) =====
interface EditorMenuItem {
  key: string;
  label: string;
  icon: string;
  disabled?: boolean;
  separator?: boolean;
  action: () => void | Promise<void>;
}

const editorItems = computed<EditorMenuItem[]>(() => {
  const hasSel = hasSelection();
  return [
    { key: "undo", label: t("editmenu.undo"), icon: "undo", action: () => doUndo() },
    { key: "redo", label: t("editmenu.redo"), icon: "redo", action: () => doRedo() },
    { key: "sep1", label: "", icon: "", separator: true, action: () => undefined },
    { key: "cut", label: t("editmenu.cut"), icon: "edit", disabled: !hasSel, action: () => void editorCut() },
    { key: "copy", label: t("editmenu.copy"), icon: "copy", disabled: !hasSel, action: () => void editorCopy() },
    { key: "paste", label: t("editmenu.paste"), icon: "edit", action: () => void editorPaste() },
    { key: "selectAll", label: t("editmenu.selectAll"), icon: "note", action: () => editorSelectAll() },
    { key: "sep2", label: "", icon: "", separator: true, action: () => undefined },
    { key: "bold", label: t("editmenu.bold"), icon: "bold", action: () => wrapSelection("**") },
    { key: "italic", label: t("editmenu.italic"), icon: "italic", action: () => wrapSelection("*") },
    { key: "strike", label: t("editmenu.strike"), icon: "strike", action: () => wrapSelection("~~") },
    { key: "inlineCode", label: t("editmenu.inlineCode"), icon: "code", action: () => wrapSelection("`") },
    { key: "sep3", label: "", icon: "", separator: true, action: () => undefined },
    { key: "h1", label: t("editmenu.heading1"), icon: "note", action: () => setHeading(1) },
    { key: "h2", label: t("editmenu.heading2"), icon: "note", action: () => setHeading(2) },
    { key: "h3", label: t("editmenu.heading3"), icon: "note", action: () => setHeading(3) },
    { key: "quote", label: t("editmenu.quote"), icon: "quote", action: () => toggleQuote() },
    { key: "bullet", label: t("editmenu.bulletList"), icon: "ul", action: () => bulletList() },
    { key: "numbered", label: t("editmenu.numberedList"), icon: "ol", action: () => numberedList() },
    { key: "task", label: t("editmenu.taskList"), icon: "task", action: () => taskList() },
    { key: "sep4", label: "", icon: "", separator: true, action: () => undefined },
    { key: "link", label: t("editmenu.link"), icon: "link", action: () => insertLink() },
    { key: "codeBlock", label: t("editmenu.codeBlock"), icon: "code", action: () => insertCodeBlock() },
    { key: "table", label: t("editmenu.table"), icon: "table", action: () => insertTable() },
    { key: "hr", label: t("editmenu.hr"), icon: "hr", action: () => insertHorizontalRule() },
    { key: "sep5", label: "", icon: "", separator: true, action: () => undefined },
    {
      key: "reload",
      label: t("editmenu.reloadFile"),
      icon: "undo",
      disabled: !editor.path,
      action: () => void reloadActiveFile(),
    },
  ];
});

const EDITOR_MENU_HEIGHT_EST = 28 * editorItems.value.length + 16;

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
    }
  }
);

function run(item: MenuItem): void {
  if (item.separator) return;
  closeContextMenu();
  item.action();
}

function runEditor(item: EditorMenuItem): void {
  if (item.separator || item.disabled) return;
  closeEditorMenu();
  void item.action();
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
            class="ctx-item"
            :class="{ disabled: item.disabled }"
            :disabled="item.disabled"
            @click="runEditor(item)"
          >
            <Icon :name="item.icon" :size="16" class="ctx-icon" />
            <span>{{ item.label }}</span>
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

.ctx-sep {
  height: 1px;
  margin: 5px 8px;
  background: var(--stroke);
}
</style>
