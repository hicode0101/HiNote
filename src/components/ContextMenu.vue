<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { t } from "@/lib/i18n";
import { ui, closeContextMenu } from "@/stores/ui";
import { settings } from "@/stores/settings";
import { createDocument, createFolder, renameNode, deleteNode, revealNode } from "@/lib/ops";
import Icon from "./Icon.vue";

const menuEl = ref<HTMLElement | null>(null);
const pos = ref({ x: 0, y: 0 });

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
    ];
  }
  if (node.kind === "dir") {
    return [
      { key: "newDoc", label: t("menu.newDoc"), icon: "documentPlus", action: () => createDocument(node.path) },
      { key: "newFolder", label: t("menu.newFolder"), icon: "folderPlus", action: () => createFolder(node.path) },
      { key: "rename", label: t("menu.rename"), icon: "edit", action: () => renameNode(node) },
      { key: "reveal", label: t("menu.reveal"), icon: "open", action: () => revealNode(node) },
      { key: "sep", label: "", icon: "", separator: true, action: () => undefined },
      { key: "delete", label: t("menu.delete"), icon: "delete", danger: true, action: () => deleteNode(node) },
    ];
  }
  return [
    { key: "rename", label: t("menu.rename"), icon: "edit", action: () => renameNode(node) },
    { key: "reveal", label: t("menu.reveal"), icon: "open", action: () => revealNode(node) },
    { key: "sep", label: "", icon: "", separator: true, action: () => undefined },
    { key: "delete", label: t("menu.delete"), icon: "delete", danger: true, action: () => deleteNode(node) },
  ];
});

const MENU_WIDTH = 220;
const MENU_HEIGHT_EST = 44 * 6 + 16;

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

function run(item: MenuItem): void {
  if (item.separator) return;
  closeContextMenu();
  item.action();
}

function onDocMouseDown(e: MouseEvent): void {
  if (!ui.contextMenu.visible) return;
  if (menuEl.value && e.target instanceof Node && menuEl.value.contains(e.target)) return;
  closeContextMenu();
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape" && ui.contextMenu.visible) closeContextMenu();
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
