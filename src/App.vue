<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { listen } from "@tauri-apps/api/event";
import { t } from "@/lib/i18n";
import { settings } from "@/stores/settings";
import { editor, flushSave, handleFileChangedEvent, isMarkdownFile, isPdfFile } from "@/stores/editor";
import { TREE_FILE_TYPE } from "@/lib/dropRef";
import { toast, ui } from "@/stores/ui";
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
import PdfViewer from "./components/PdfViewer.vue";
import StatusBar from "./components/StatusBar.vue";
import SettingsDialog from "./components/SettingsDialog.vue";
import AboutDialog from "./components/AboutDialog.vue";
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

// External edits usually happen while HiNote is in the background, so the
// one-shot "file-changed" event gets dropped by the hasFocus guard in the
// store. Re-check the mtime baseline when the window regains focus; the
// handler is idempotent (same-mtime return + watchBusy re-entry guard).
function onWindowFocus(): void {
  void handleFileChangedEvent();
}

// With Tauri's built-in drag-drop disabled, a stray drop (e.g. an external
// file from Explorer) would navigate the webview away. Block everything that
// isn't our internal tree-file payload; editor text drags keep working.
function isTreeFileDrag(e: DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes(TREE_FILE_TYPE);
}
function onDocDragOver(e: DragEvent): void {
  if (isTreeFileDrag(e)) return; // editor's own handlers decide
  e.preventDefault();
}
function onDocDrop(e: DragEvent): void {
  if (isTreeFileDrag(e)) return;
  e.preventDefault();
}

onMounted(async () => {
  document.addEventListener("keydown", onKeydown);
  window.addEventListener("focus", onWindowFocus);
  document.addEventListener("dragover", onDocDragOver, true);
  document.addEventListener("drop", onDocDrop, true);
  try {
    unlistenFs = await listen("workspace-changed", scheduleTreeRefresh);
    unlistenFile = await listen("file-changed", () => void handleFileChangedEvent());
  } catch {
    // Outside Tauri there is no event bridge; the tree stays manual.
  }
});
onUnmounted(() => {
  document.removeEventListener("keydown", onKeydown);
  window.removeEventListener("focus", onWindowFocus);
  document.removeEventListener("dragover", onDocDragOver, true);
  document.removeEventListener("drop", onDocDrop, true);
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
          <!-- PDF: dedicated read-only viewer -->
          <PdfViewer v-if="isPdfFile()" />
          <!-- Fluid (WYSIWYG) is Markdown-only; other file types stay classic. -->
          <EditorFluid v-else-if="settings.editorMode === 'fluid' && isMarkdownFile()" />
          <template v-else>
            <FormatToolbar v-if="editor.view === 'edit' && isMarkdownFile()" />
            <EditorClassic v-show="editor.view === 'edit'" />
            <PreviewPane v-if="editor.view === 'preview' && isMarkdownFile()" />
          </template>
          <StatusBar v-if="!isPdfFile()" />
        </template>

        <div v-else class="editor-empty">
          <div class="empty-card">
            <Icon name="note" :size="44" class="empty-icon" />
            <div class="empty-title">{{ t("editor.emptyTitle") }}</div>
            <div class="empty-desc">{{ t("editor.emptyDesc") }}</div>
            <button class="btn primary empty-btn" @click="createDocument(settings.workspace!, 'md')">
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
    <AboutDialog v-if="ui.aboutOpen" />
    <PromptDialog />
    <ContextMenu />
    <ImagePreview />

    <!-- Global toast (formatter results, errors) -->
    <transition name="fade">
      <div v-if="toast.visible" class="toast">{{ toast.text }}</div>
    </transition>
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

.toast {
  position: fixed;
  right: 20px;
  bottom: 44px;
  z-index: 960;
  max-width: 420px;
  padding: 9px 14px;
  border: 1px solid var(--stroke);
  border-radius: var(--radius-sm);
  background: var(--bg-layer);
  box-shadow: var(--shadow-flyout);
  font-size: 12.5px;
  color: var(--text-primary);
  user-select: text;
  word-break: break-all;
}
</style>
