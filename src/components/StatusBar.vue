<script setup lang="ts">
import { computed } from "vue";
import { t } from "@/lib/i18n";
import { editor } from "@/stores/editor";
import { settings } from "@/stores/settings";

const isClassic = computed(() => settings.editorMode === "classic");

const saveState = computed(() => {
  if (editor.saving) return t("editor.saving");
  return editor.dirty ? t("editor.unsaved") : t("editor.saved");
});
</script>

<template>
  <footer class="status-bar">
    <div class="left">
      <template v-if="isClassic">
        <span class="item">{{ t("status.line") }} {{ editor.cursor.line }}, {{ t("status.col") }} {{ editor.cursor.col }}</span>
        <span class="divider"></span>
      </template>
      <span class="item">{{ editor.content.length }} {{ t("status.chars") }}</span>
      <span class="divider"></span>
      <span class="item">{{ t("status.markdown") }}</span>
    </div>
    <div class="right">
      <span class="item save" :class="{ dirty: editor.dirty }">{{ saveState }}</span>
      <span class="divider"></span>
      <span class="item">{{ t("status.lf") }}</span>
      <span class="divider"></span>
      <span class="item">{{ t("status.utf8") }}</span>
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
