<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { t } from "@/lib/i18n";
import { settings } from "@/stores/settings";
import { editor, flushSave } from "@/stores/editor";
import { ui } from "@/stores/ui";
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
import Icon from "./components/Icon.vue";

function onKeydown(e: KeyboardEvent): void {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    void flushSave();
  }
}

onMounted(() => document.addEventListener("keydown", onKeydown));
onUnmounted(() => document.removeEventListener("keydown", onKeydown));
</script>

<template>
  <div class="app-shell">
    <TitleBar />

    <div v-if="settings.workspace" class="app-body">
      <Sidebar />

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
