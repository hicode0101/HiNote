<script setup lang="ts">
import { computed } from "vue";
import { t } from "@/lib/i18n";
import { settings, toggleSidebar } from "@/stores/settings";
import { editor, isDioFile } from "@/stores/editor";
import { closeActiveFile } from "@/stores/workspace";
import { exportDio, dio } from "@/stores/dio";
import { langForPath, langIcon } from "@/lib/languages";
import Icon from "./Icon.vue";

const breadcrumbs = computed<string[]>(() => {
  if (!settings.workspace || !editor.path) return [];
  let rel = editor.path;
  const ws = settings.workspace.replace(/[\\/]+$/, "");
  if (rel.toLowerCase().startsWith(ws.toLowerCase())) {
    rel = rel.slice(ws.length).replace(/^[\\/]/, "");
  }
  return rel.split(/[\\/]/).filter(Boolean);
});

// Breadcrumb icon reflects the file type (md/txt/code/pdf/image).
const crumbIcon = computed(() =>
  editor.path ? langIcon(langForPath(editor.path)) : "note"
);
</script>

<template>
  <div class="editor-header">
    <nav class="breadcrumb" :title="editor.path ?? ''">
      <button
        class="icon-btn panel-toggle"
        :title="settings.sidebarCollapsed ? t('sidebar.expand') : t('sidebar.collapse')"
        @click="toggleSidebar"
      >
        <Icon :name="settings.sidebarCollapsed ? 'chevronRight' : 'chevronLeft'" :size="15" />
      </button>
      <Icon :name="crumbIcon" :size="14" class="crumb-icon" />
      <template v-if="breadcrumbs.length">
        <span class="crumb muted">{{ t("app.allNotes") }}</span>
        <template v-for="(seg, i) in breadcrumbs" :key="i">
          <Icon name="chevronRight" :size="10" class="crumb-sep" />
          <span class="crumb" :class="{ muted: i < breadcrumbs.length - 1 }">
            {{ seg }}
          </span>
          <span
            v-if="i === breadcrumbs.length - 1 && editor.dirty"
            class="dirty-dot"
            :title="t('editor.unsaved')"
          ></span>
        </template>
      </template>
      <span v-else class="crumb muted">{{ t("app.allNotes") }}</span>
      <!-- Close the open document and return to the empty view. -->
      <button
        v-if="editor.path"
        class="icon-btn close-file-btn"
        :title="t('editor.closeFile')"
        @click="closeActiveFile"
      >
        <Icon name="dismiss" :size="14" />
      </button>
    </nav>

    <!-- drawio 流程图：导出为 SVG / PNG（数据由 iframe 内 drawio 渲染） -->
    <div v-if="isDioFile()" class="header-actions">
      <button class="btn dio-export-btn" :disabled="dio.exporting" @click="exportDio('svg')">
        <Icon name="download" :size="14" />
        {{ t("dio.exportSvg") }}
      </button>
      <button class="btn dio-export-btn" :disabled="dio.exporting" @click="exportDio('png')">
        <Icon name="download" :size="14" />
        {{ t("dio.exportPng") }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  height: 42px;
  padding: 0 16px;
  border-bottom: 1px solid var(--stroke);
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
}
.panel-toggle {
  margin-right: 4px;
  flex-shrink: 0;
}
.crumb-icon {
  color: var(--accent);
  flex-shrink: 0;
}
.crumb {
  font-size: 12.5px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
}
.crumb.muted {
  color: var(--text-tertiary);
}
.crumb:last-child {
  font-weight: 600;
}
.crumb-sep {
  color: var(--text-tertiary);
  flex-shrink: 0;
}

/* Unsaved-changes marker after the filename crumb. */
.dirty-dot {
  flex-shrink: 0;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent);
}

/* Close-document button right after the breadcrumb. */
.close-file-btn {
  flex-shrink: 0;
  margin-left: 4px;
  width: 24px;
  height: 24px;
  padding: 0;
  color: var(--text-tertiary);
}
.close-file-btn:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

/* drawio 导出按钮（仅 *.dio 打开时显示在头部右侧） */
.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.dio-export-btn {
  height: 26px;
  padding: 0 10px;
  font-size: 12px;
  gap: 5px;
}
.dio-export-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

</style>
