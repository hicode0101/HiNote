<script setup lang="ts">
import { t } from "@/lib/i18n";
import {
  wrapSelection,
  setHeading,
  toggleQuote,
  bulletList,
  numberedList,
  taskList,
  insertLink,
  insertCodeBlock,
  insertTable,
  insertHorizontalRule,
  doUndo,
  doRedo,
} from "@/lib/markdownActions";
import { pickAndInsertImage } from "@/lib/ops";
import Icon from "./Icon.vue";

interface ToolItem {
  key: string;
  label: string;
  icon?: string;
  text?: string;
  run: () => void;
}

const leftGroup: ToolItem[] = [
  { key: "bold", label: t("toolbar.bold"), icon: "bold", run: () => wrapSelection("**", "**", t("toolbar.bold")) },
  { key: "italic", label: t("toolbar.italic"), icon: "italic", run: () => wrapSelection("*", "*", t("toolbar.italic")) },
  { key: "strike", label: t("toolbar.strike"), icon: "strike", run: () => wrapSelection("~~", "~~", t("toolbar.strike")) },
  { key: "h1", label: t("toolbar.h1"), text: "H1", run: () => setHeading(1) },
  { key: "h2", label: t("toolbar.h2"), text: "H2", run: () => setHeading(2) },
  { key: "h3", label: t("toolbar.h3"), text: "H3", run: () => setHeading(3) },
];

const midGroup: ToolItem[] = [
  { key: "quote", label: t("toolbar.quote"), icon: "quote", run: toggleQuote },
  { key: "ul", label: t("toolbar.ul"), icon: "ul", run: bulletList },
  { key: "ol", label: t("toolbar.ol"), icon: "ol", run: numberedList },
  { key: "task", label: t("toolbar.task"), icon: "task", run: taskList },
];

const insertGroup: ToolItem[] = [
  { key: "code", label: t("toolbar.code"), icon: "code", run: () => wrapSelection("`", "`", "code") },
  { key: "codeblock", label: t("toolbar.codeblock"), icon: "code", run: insertCodeBlock },
  { key: "link", label: t("toolbar.link"), icon: "link", run: insertLink },
  { key: "image", label: t("toolbar.image"), icon: "image", run: () => void pickAndInsertImage() },
  { key: "table", label: t("toolbar.table"), icon: "table", run: insertTable },
  { key: "hr", label: t("toolbar.hr"), icon: "hr", run: insertHorizontalRule },
];

const historyGroup: ToolItem[] = [
  { key: "undo", label: t("toolbar.undo"), icon: "undo", run: doUndo },
  { key: "redo", label: t("toolbar.redo"), icon: "redo", run: doRedo },
];
</script>

<template>
  <div class="format-toolbar">
    <template v-for="(group, gi) in [leftGroup, midGroup, insertGroup, historyGroup]" :key="gi">
      <div class="tb-group" :class="{ 'first': gi === 0 }">
        <button
          v-for="item in group"
          :key="item.key"
          class="tool-btn"
          :title="item.label"
          @click="item.run"
        >
          <Icon v-if="item.icon && item.key !== 'codeblock'" :name="item.icon" :size="17" />
          <Icon v-else-if="item.icon" :name="item.icon" :size="16" />
          <span v-else-if="item.text" class="tool-text">{{ item.text }}</span>
        </button>
      </div>
      <div v-if="gi < 3" class="tb-divider"></div>
    </template>
  </div>
</template>

<style scoped>
.format-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  border-bottom: 1px solid var(--stroke);
  overflow-x: auto;
  scrollbar-width: none;
}
.format-toolbar::-webkit-scrollbar {
  display: none;
}

.tb-group {
  display: flex;
  align-items: center;
  gap: 1px;
}

.tb-divider {
  width: 1px;
  height: 20px;
  margin: 0 6px;
  background: var(--stroke-strong);
}

.tool-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 30px;
  padding: 0 6px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  transition: background 0.12s ease;
}
.tool-btn:hover {
  background: var(--bg-hover);
}
.tool-btn:active {
  background: var(--bg-active);
}

.tool-text {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  letter-spacing: 0.2px;
}
.tool-btn:hover .tool-text {
  color: var(--accent);
}
</style>
