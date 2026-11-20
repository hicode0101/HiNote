<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { listen } from "@tauri-apps/api/event";
import { t } from "@/lib/i18n";
import { settings } from "@/stores/settings";
import { editor, flushSave, handleFileChangedEvent } from "@/stores/editor";
import { ui } from "@/stores/ui";
import { refreshTree } from "@/stores/workspace";
import { createDocument } from "@/lib/ops";
import TitleBar from "./components/TitleBar.vue";
import Sidebar from "./components/Sidebar.vue";
import WelcomeView from "./components/WelcomeView.vue";
import EditorHeader from "./components/EditorHeader.vue";
import FormatToolbar from "./components/FormatToolbar.vue";
import EditorClassic from "./components/EditorClassic.vue";
import EditorFluid from "./components/EditorFluid.vue";
import PreviewPane from "./components/PreviewPane.vue";
import StatusBar from "./components/StatusBar.vue";
import SettingsDialog from "./components/SettingsDialog.vue";
import PromptDialog from "./components/PromptDialog.vue";
import ContextMenu from "./components/ContextMenu.vue";
import ImagePreview from "./components/ImagePreview.vue";
import Icon from "./components/Icon.vue";

function onKeydown(e: KeyboardEvent): void {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    void flushSave();
  }
}

// ===== Auto-refresh the tree on external FS changes =====
// The Rust watcher emits "workspace-changed" (already debounced + diffed);
// re-debounce briefly here to coalesce bursts across event deliveries.
let treeRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let unlistenFs: (() => void) | null = null;
let unlistenFile: (() => void) | null = null;

function scheduleTreeRefresh(): void {
  if (!settings.workspace || treeRefreshTimer) return;
  treeRefreshTimer = setTimeout(() => {
    treeRefreshTimer = null;
    void refreshTree();
  }, 300);
}

onMounted(async () => {
  document.addEventListener("keydown", onKeydown);
  try {
    unlistenFs = await listen("workspace-changed", scheduleTreeRefresh);
    unlistenFile = await listen("file-changed", () => void handleFileChangedEvent());
  } catch {
    // Outside Tauri there is no event bridge; the tree stays manual.
  }
});
onUnmounted(() => {
  document.removeEventListener("keydown", onKeydown);
  unlistenFs?.();
  unlistenFile?.();
  if (treeRefreshTimer) clearTimeout(treeRefreshTimer);
});
onUnmounted(() => {
  document.removeEventListener("keydown", onKeydown);
  unlistenFs?.();
  if (treeRefreshTimer) clearTimeout(treeRefreshTimer);
});
</script>

<template>
  <div class="app-shell">
    <TitleBar />

    <div v-if="settings.workspace" class="app-body">
      <div class="sidebar-slot" :class="{ collapsed: settings.sidebarCollapsed }">
        <Sidebar />
      </div>

      <main class="main-area">
        <EditorHeader />

        <template v-if="editor.path">
          <EditorFluid v-if="settings.editorMode === 'fluid'" />
          <template v-else>
            <FormatToolbar v-if="editor.view === 'edit'" />
            <EditorClassic v-show="editor.view === 'edit'" />
            <PreviewPane v-if="editor.view === 'preview'" />
          </template>
          <StatusBar />
        </template>

        <div v-else class="editor-empty">
          <div class="empty-card">
            <Icon name="note" :size="44" class="empty-icon" />
            <div class="empty-title">{{ t("editor.emptyTitle") }}</div>
            <div class="empty-desc">{{ t("editor.emptyDesc") }}</div>
            <button class="btn primary empty-btn" @click="createDocument(settings.workspace!)">
              <Icon name="documentPlus" :size="16" />
              {{ t("editor.newDoc") }}
            </button>
          </div>
        </div>
      </main>
    </div>

    <div v-else class="app-body">
      <WelcomeView />
    </div>

    <SettingsDialog v-if="ui.settingsOpen" />
    <PromptDialog />
    <ContextMenu />
    <ImagePreview />
  </div>
</template>

<style>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.app-body {
  display: flex;
  flex: 1;
  min-height: 0;
}

/* Sidebar collapse: animate the slot width so the editor area grows smoothly. */
.sidebar-slot {
  display: flex;
  height: 100%;
  width: var(--sidebar-width);
  overflow: hidden;
  transition: width 0.18s ease;
}
.sidebar-slot.collapsed {
  width: 0;
}
.sidebar-slot .sidebar {
  flex-shrink: 0;
}

.main-area {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.editor-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-layer);
}

.empty-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 40px;
}

.empty-icon {
  color: var(--text-tertiary);
  margin-bottom: 18px;
}

.empty-title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 6px;
}

.empty-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 22px;
}
</style>
