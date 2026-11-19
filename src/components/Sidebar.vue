<script setup lang="ts">
import { computed } from "vue";
import { t } from "@/lib/i18n";
import { workspace } from "@/stores/workspace";
import { settings, persistSettings } from "@/stores/settings";
import { baseName } from "@/lib/tauri";
import { createDocument, createFolder } from "@/lib/ops";
import TreeNodeItem from "./TreeNodeItem.vue";
import Icon from "./Icon.vue";

const workspaceName = computed(() =>
  settings.workspace ? baseName(settings.workspace) : ""
);

const filtered = computed(() => {
  const q = workspace.filter.trim().toLowerCase();
  if (!q) return workspace.tree;
  const match = (nodes: typeof workspace.tree): typeof workspace.tree => {
    const out: typeof workspace.tree = [];
    for (const node of nodes) {
      if (node.kind === "dir") {
        const children = match(node.children);
        if (node.name.toLowerCase().includes(q) || children.length) {
          out.push({ ...node, children });
        }
      } else if (node.name.toLowerCase().includes(q)) {
        out.push(node);
      }
    }
    return out;
  };
  return match(workspace.tree);
});

function changeWorkspace(): void {
  settings.workspace = null;
  void persistSettings();
}

function onTreeContext(e: MouseEvent): void {
  // Blank area of the tree = root operations.
  if ((e.target as HTMLElement).closest(".tree-row")) return;
  e.preventDefault();
  import("@/stores/ui").then((m) => m.openContextMenu(e.clientX, e.clientY, null));
}
</script>

<template>
  <aside class="sidebar">
    <div class="search-wrap">
      <Icon name="search" :size="15" class="search-icon" />
      <input
        v-model="workspace.filter"
        class="search-input"
        type="text"
        :placeholder="t('sidebar.search')"
      />
    </div>

    <div class="side-header">
      <span class="side-title">{{ t("app.allNotes") }}</span>
      <div class="side-actions">
        <button class="icon-btn" :title="t('sidebar.newNote')" @click="createDocument(settings.workspace!)">
          <Icon name="documentPlus" :size="16" />
        </button>
        <button class="icon-btn" :title="t('sidebar.newFolder')" @click="createFolder(settings.workspace!)">
          <Icon name="folderPlus" :size="16" />
        </button>
      </div>
    </div>

    <div class="tree-scroll" @contextmenu="onTreeContext">
      <div v-if="!workspace.tree.length && !workspace.loading" class="tree-empty">
        {{ workspace.error ? t("welcome.workspaceMissing") : t("sidebar.empty") }}
      </div>
      <div v-else-if="!filtered.length" class="tree-empty">{{ t("sidebar.noMatch") }}</div>
      <ul v-else class="tree-root">
        <TreeNodeItem
          v-for="node in filtered"
          :key="node.path"
          :node="node"
          :depth="0"
          :filter-active="!!workspace.filter.trim()"
        />
      </ul>
    </div>

    <div class="side-footer">
      <Icon name="folder" :size="15" class="footer-icon" />
      <div class="footer-info">
        <div class="footer-name">{{ workspaceName }}</div>
        <button class="footer-btn" @click="changeWorkspace">
          {{ t("sidebar.changeWorkspace") }}
        </button>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  width: var(--sidebar-width);
  min-width: var(--sidebar-width);
  height: 100%;
  border-right: 1px solid var(--stroke);
  background: var(--bg-card);
  backdrop-filter: blur(20px);
}

.search-wrap {
  position: relative;
  margin: 10px 12px 4px;
}
.search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-tertiary);
  pointer-events: none;
}
.search-input {
  width: 100%;
  height: 32px;
  padding: 0 10px 0 32px;
  border: 1px solid var(--stroke-control);
  border-radius: var(--radius-sm);
  background: var(--bg-layer);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 13px;
  outline: none;
  user-select: text;
}
.search-input::placeholder {
  color: var(--text-tertiary);
}
.search-input:focus {
  border-color: var(--accent);
  border-bottom-width: 2px;
}

.side-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px 4px 16px;
}
.side-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  letter-spacing: 0.3px;
}
.side-actions {
  display: flex;
  gap: 2px;
}
.side-actions .icon-btn {
  width: 28px;
  height: 28px;
}

.tree-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 2px 8px 8px;
}

.tree-empty {
  padding: 24px 12px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 13px;
}

.tree-root,
.tree-root :deep(ul) {
  list-style: none;
  margin: 0;
  padding: 0;
}

.side-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid var(--stroke);
}
.footer-icon {
  color: var(--accent);
}
.footer-info {
  min-width: 0;
}
.footer-name {
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.footer-btn {
  border: none;
  background: transparent;
  padding: 0;
  font-size: 11px;
  color: var(--text-secondary);
  cursor: pointer;
}
.footer-btn:hover {
  color: var(--accent);
  text-decoration: underline;
}
</style>
