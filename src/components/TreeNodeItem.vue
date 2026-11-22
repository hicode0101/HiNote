<script setup lang="ts">
import { computed } from "vue";
import type { TreeNode } from "@/lib/tauri";
import { langIcon, langColorClass, type LangId } from "@/lib/languages";
import { setTreeFileData } from "@/lib/dropRef";
import { workspace, toggleExpand, activateFile } from "@/stores/workspace";
import { openContextMenu } from "@/stores/ui";
import Icon from "./Icon.vue";

const props = defineProps<{
  node: TreeNode;
  depth: number;
  filterActive?: boolean;
}>();

const isDir = computed(() => props.node.kind === "dir");
// Per-type icon + color: md/txt/pdf/image/code languages get distinct glyphs.
const fileLang = computed<LangId | null>(() =>
  isDir.value ? null : ((props.node.file_type as LangId) ?? null)
);
const iconName = computed(() =>
  isDir.value ? "folder" : fileLang.value ? langIcon(fileLang.value) : "document"
);
const iconClass = computed(() =>
  isDir.value ? "" : langColorClass(fileLang.value)
);
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

// Files can be dragged into the editor to insert an image/link reference.
function onDragStart(e: DragEvent): void {
  if (isDir.value || !e.dataTransfer) return;
  setTreeFileData(e.dataTransfer, props.node.path, props.node.name);
}
</script>

<template>
  <li>
    <div
      class="tree-row"
      :class="{ active, dir: isDir }"
      :style="{ paddingLeft: 8 + depth * 18 + 'px' }"
      :draggable="!isDir"
      @click="onClick"
      @contextmenu="onContext"
      @dragstart="onDragStart"
    >
      <span class="twisty">
        <Icon
          v-if="isDir"
          :name="expanded ? 'chevronDown' : 'chevronRight'"
          :size="12"
          class="twisty-icon"
        />
      </span>
      <Icon :name="iconName" :size="16" class="row-icon" :class="iconClass" />
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
  color: var(--text-tertiary);
}
/* File-type color highlighting (Fluent palette, works on light & dark) */
.row-icon.type-md {
  color: var(--accent);
}
.row-icon.type-txt {
  color: var(--text-secondary);
}
.row-icon.type-pdf {
  color: #c42b1c;
}
.row-icon.type-image {
  color: #0f7b6c;
}
.row-icon.type-dio {
  color: #f08705;
}
.row-icon.type-code {
  color: #8250df;
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
