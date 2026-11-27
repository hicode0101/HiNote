<script setup lang="ts">
import { computed } from "vue";
import { t } from "@/lib/i18n";
import { editor } from "@/stores/editor";

const saveState = computed(() => {
  if (editor.saving) return t("editor.saving");
  return editor.dirty ? t("editor.unsaved") : t("editor.saved");
});

// 行尾符显示：读取打开文件时检测到的真实行尾（editor.ts 的 detectEol），
// 保存时也按该值还原，编辑器内部恒为 \n 归一化文本
const eolLabel = computed(() => (editor.eol === "\r\n" ? "CRLF" : "LF"));
</script>

<template>
  <footer class="status-bar">
    <div class="left">
      <span class="item">{{ t("status.line") }} {{ editor.cursor.line }}, {{ t("status.col") }} {{ editor.cursor.col }}</span>
      <span class="divider"></span>
      <span class="item">{{ editor.content.length }} {{ t("status.chars") }}</span>
    </div>
    <div class="right">
      <span class="item save" :class="{ dirty: editor.dirty }">{{ saveState }}</span>
      <span class="divider"></span>
      <span class="item" :title="t('status.eolTip')">{{ eolLabel }}</span>
    </div>
  </footer>
</template>

<style scoped>
.status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 28px;
  padding: 0 14px;
  border-top: 1px solid var(--stroke);
  font-size: 11.5px;
  color: var(--text-secondary);
  background: var(--bg-card);
}

.left,
.right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.item {
  white-space: nowrap;
}

.save.dirty {
  color: var(--accent);
}

.divider {
  width: 1px;
  height: 12px;
  background: var(--stroke-strong);
}
</style>
