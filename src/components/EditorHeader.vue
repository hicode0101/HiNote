<script setup lang="ts">
import { computed } from "vue";
import { t } from "@/lib/i18n";
import { settings, updateEditorMode, toggleSidebar, type EditorMode } from "@/stores/settings";
import { editor, isMarkdownFile } from "@/stores/editor";
import { closeActiveFile } from "@/stores/workspace";
import { baseName } from "@/lib/tauri";
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

const activeFile = computed(() =>
  editor.path ? baseName(editor.path) : ""
);

// Mode switch + edit/preview tabs only make sense for Markdown notes;
// other types (txt/code/json/pdf) open straight in the classic editor/viewer.
const mdControls = computed(() => isMarkdownFile());

// Breadcrumb icon reflects the file type (md/txt/code/pdf/image).
const crumbIcon = computed(() =>
  editor.path ? langIcon(langForPath(editor.path)) : "note"
);

async function setMode(mode: EditorMode): Promise<void> {
  const { flushSave } = await import("@/stores/editor");
  await flushSave();
  await updateEditorMode(mode);
}

function setView(view: "edit" | "preview"): void {
  editor.view = view;
}
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

    <div class="header-right">
      <!-- Classic mode: edit / preview tabs (image 2 style) — Markdown only -->
      <div v-if="mdControls && settings.editorMode === 'classic'" class="view-tabs">
        <button
          class="view-tab"
          :class="{ on: editor.view === 'edit' }"
          @click="setView('edit')"
        >
          {{ t("editor.edit") }}
        </button>
        <button
          class="view-tab"
          :class="{ on: editor.view === 'preview' }"
          @click="setView('preview')"
        >
          {{ t("editor.preview") }}
        </button>
      </div>

      <!-- Mode switch: classic / fluid (Markdown only) -->
      <div v-if="mdControls" class="mode-switch" :title="activeFile">
        <button
          class="mode-btn"
          :class="{ on: settings.editorMode === 'classic' }"
          @click="setMode('classic')"
        >
          {{ t("editor.classic") }}
        </button>
        <button
          class="mode-btn"
          :class="{ on: settings.editorMode === 'fluid' }"
          @click="setMode('fluid')"
        >
          {{ t("editor.fluid") }}
        </button>
      </div>
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

.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.view-tabs {
  display: flex;
  padding: 3px;
  background: var(--bg-subtle);
  border: 1px solid var(--stroke);
  border-radius: var(--radius-sm);
}
.view-tab {
  height: 26px;
  padding: 0 14px;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 12.5px;
  cursor: pointer;
  transition: all 0.12s ease;
}
.view-tab:hover {
  color: var(--text-primary);
}
.view-tab.on {
  background: var(--bg-layer);
  color: var(--accent);
  font-weight: 600;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.mode-switch {
  display: flex;
  padding: 3px;
  background: var(--bg-subtle);
  border: 1px solid var(--stroke);
  border-radius: var(--radius-sm);
}
.mode-btn {
  height: 26px;
  padding: 0 12px;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 12.5px;
  cursor: pointer;
  transition: all 0.12s ease;
}
.mode-btn:hover {
  color: var(--text-primary);
}
.mode-btn.on {
  background: var(--accent);
  color: var(--accent-text);
  font-weight: 600;
}
</style>
