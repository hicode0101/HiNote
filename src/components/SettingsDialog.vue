<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { t } from "@/lib/i18n";
import { ui } from "@/stores/ui";
import {
  settings,
  updateTheme,
  updateLanguage,
  updateImagesDir,
} from "@/stores/settings";
import Icon from "./Icon.vue";

const imagesDirInput = ref(settings.imagesDir);
let imagesDirTimer: ReturnType<typeof setTimeout> | null = null;

function onImagesDirInput(): void {
  if (imagesDirTimer) clearTimeout(imagesDirTimer);
  imagesDirTimer = setTimeout(() => {
    imagesDirTimer = null;
    void updateImagesDir(imagesDirInput.value);
  }, 500);
}

function onImagesDirBlur(): void {
  imagesDirInput.value = settings.imagesDir;
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape" && ui.settingsOpen) ui.settingsOpen = false;
}

onMounted(() => document.addEventListener("keydown", onKeydown));
onUnmounted(() => document.removeEventListener("keydown", onKeydown));
</script>

<template>
  <Teleport to="body">
    <transition name="fade">
      <div class="settings-overlay" @click.self="ui.settingsOpen = false">
        <div class="settings-panel" role="dialog" :aria-label="t('settings.title')">
          <header class="panel-header">
            <h2 class="panel-title">{{ t("settings.title") }}</h2>
            <button class="icon-btn" @click="ui.settingsOpen = false">
              <Icon name="dismiss" :size="16" />
            </button>
          </header>

          <div class="panel-body">
            <!-- Images dir -->
            <div class="setting-row">
              <div class="row-text">
                <div class="row-label">{{ t("settings.imagesDir") }}</div>
                <div class="row-hint">{{ t("settings.imagesDirHint") }}</div>
              </div>
              <input
                v-model="imagesDirInput"
                class="text-input dir-input"
                type="text"
                spellcheck="false"
                @input="onImagesDirInput"
                @blur="onImagesDirBlur"
              />
            </div>

            <!-- Language -->
            <div class="setting-row">
              <div class="row-text">
                <div class="row-label">{{ t("settings.language") }}</div>
                <div class="row-hint">{{ t("settings.languageHint") }}</div>
              </div>
              <select
                class="combo"
                :value="settings.language"
                @change="updateLanguage(($event.target as HTMLSelectElement).value as any)"
              >
                <option value="system">{{ t("settings.system") }}</option>
                <option value="zh-CN">简体中文</option>
                <option value="en-US">English</option>
              </select>
            </div>

            <!-- Theme -->
            <div class="setting-row">
              <div class="row-text">
                <div class="row-label">{{ t("settings.theme") }}</div>
                <div class="row-hint">{{ t("settings.themeHint") }}</div>
              </div>
              <select
                class="combo"
                :value="settings.theme"
                @change="updateTheme(($event.target as HTMLSelectElement).value as any)"
              >
                <option value="system">{{ t("settings.system") }}</option>
                <option value="light">{{ t("settings.light") }}</option>
                <option value="dark">{{ t("settings.dark") }}</option>
              </select>
            </div>
          </div>

          <footer class="panel-footer">
            <button class="btn primary" @click="ui.settingsOpen = false">
              {{ t("settings.close") }}
            </button>
          </footer>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
.settings-overlay {
  position: fixed;
  inset: 0;
  z-index: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
}

.settings-panel {
  display: flex;
  flex-direction: column;
  width: 620px;
  max-width: calc(100vw - 48px);
  max-height: calc(100vh - 64px);
  border: 1px solid var(--stroke);
  border-radius: var(--radius-md);
  background: var(--bg-layer);
  box-shadow: var(--shadow-dialog);
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px 10px;
}
.panel-title {
  margin: 0;
  font-size: 20px;
  font-weight: 650;
}

.panel-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 24px;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 16px 0;
  border-bottom: 1px solid var(--stroke);
}
.setting-row:last-child {
  border-bottom: none;
}

.row-text {
  min-width: 0;
}
.row-label {
  font-size: 14px;
  font-weight: 600;
}
.row-hint {
  margin-top: 3px;
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dir-input {
  width: 180px;
}

.panel-footer {
  display: flex;
  justify-content: flex-end;
  padding: 12px 24px 18px;
}
</style>
