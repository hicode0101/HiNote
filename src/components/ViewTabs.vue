<script setup lang="ts">
import { t } from "@/lib/i18n";
import { editor, isMarkdownFile } from "@/stores/editor";

function setView(view: "edit" | "split" | "preview"): void {
  editor.view = view;
}
</script>

<template>
  <!-- 经典模式的 编辑/分屏编辑/预览 分段控件（HiEditor 图1 样式）：位于
       格式工具栏之下、编辑区之上。三种视图下都显示，保证随时能切换；
       仅 Markdown 笔记渲染（其他类型直接进入经典编辑器）。 -->
  <div v-if="isMarkdownFile()" class="view-bar">
    <div class="view-seg">
      <button
        class="view-seg-btn"
        :class="{ active: editor.view === 'edit' }"
        @click="setView('edit')"
      >
        {{ t("editor.edit") }}
      </button>
      <button
        class="view-seg-btn"
        :class="{ active: editor.view === 'split' }"
        @click="setView('split')"
      >
        {{ t("editor.split") }}
      </button>
      <button
        class="view-seg-btn"
        :class="{ active: editor.view === 'preview' }"
        @click="setView('preview')"
      >
        {{ t("editor.preview") }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.view-bar {
  flex: 0 0 40px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  border-bottom: 1px solid var(--stroke);
}

.view-seg {
  display: flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--stroke);
  border-radius: 8px;
  background: var(--bg-subtle);
}

.view-seg-btn {
  padding: 4px 20px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.12s ease;
}
.view-seg-btn:hover {
  color: var(--text-primary);
}
.view-seg-btn.active {
  background: var(--accent);
  color: var(--accent-text);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}
.view-seg-btn.active:hover {
  color: var(--accent-text);
  filter: brightness(1.1); /* 已激活段悬停：保持强调色填充，仅微微提亮 */
}
</style>
