<script setup lang="ts">
import { computed } from "vue";
import type { TreeNode } from "@/lib/tauri";
import { workspace, toggleExpand, activateFile } from "@/stores/workspace";
import { openContextMenu } from "@/stores/ui";
import Icon from "./Icon.vue";

const props = defineProps<{
  node: TreeNode;
  depth: number;
  filterActive?: boolean;
}>();

const isDir = computed(() => props.node.kind === "dir");
const expanded = computed(
  () => props.filterActive || workspace.expanded.has(props.node.path)
);
const active = computed(() => workspace.activePath === props.node.path);

function onClick(): void {
  if (isDir.value) {
    toggleExpand(props.node.path);
  } else {
    void activateFile(props.node.path);
  }
}

function onContext(e: MouseEvent): void {
  e.preventDefault();
  e.stopPropagation();
  openContextMenu(e.clientX, e.clientY, {
    name: props.node.name,
    path: props.node.path,
    kind: props.node.kind,
  });
}
</script>

<template>
  <li>
    <div
      class="tree-row"
      :class="{ active, dir: isDir }"
      :style="{ paddingLeft: 8 + depth * 18 + 'px' }"
      @click="onClick"
      @contextmenu="onContext"
    >
      <span class="twisty">
        <Icon
          v-if="isDir"
          :name="expanded ? 'chevronDown' : 'chevronRight'"
          :size="12"
          class="twisty-icon"
        />
      </span>
      <Icon :name="isDir ? 'folder' : 'document'" :size="16" class="row-icon" />
      <span class="row-label" :title="node.name">{{ node.name }}</span>
    </div>

    <ul v-if="isDir && expanded && node.children.length" class="tree-children">
      <TreeNodeItem
        v-for="child in node.children"
        :key="child.path"
        :node="child"
        :depth="depth + 1"
        :filter-active="filterActive"
      />
    </ul>
    <div v-else-if="isDir && expanded && !node.children.length" class="empty-child" :style="{ paddingLeft: 8 + (depth + 1) * 18 + 14 + 'px' }"></div>
  </li>
</template>

<style scoped>
.tree-row {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding-right: 8px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.12s ease;
  color: var(--text-primary);
}
.tree-row:hover {
  background: var(--bg-hover);
}
.tree-row.active {
  background: var(--accent-subtle-bg);
  color: var(--accent);
}
.tree-row.active .row-label {
  color: var(--accent);
  font-weight: 600;
}

.twisty {
  width: 14px;
  height: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--text-tertiary);
}
.twisty-icon {
  transition: transform 0.15s ease;
}

.row-icon {
  flex-shrink: 0;
  color: var(--accent);
}
.tree-row:not(.dir) .row-icon {
  color: var(--text-tertiary);
}

.row-label {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tree-children {
  list-style: none;
  margin: 0;
  padding: 0;
}

.empty-child {
  height: 6px;
}
</style>
