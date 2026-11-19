<script setup lang="ts">
import { ref } from "vue";
import { t } from "@/lib/i18n";
import { api, baseName } from "@/lib/tauri";
import { workspace, chooseWorkspace, removeRecent } from "@/stores/workspace";
import { settings } from "@/stores/settings";
import Icon from "./Icon.vue";

const busy = ref(false);

async function pickWorkspace(): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  try {
    const dir = await api.pickDirectory();
    if (dir) {
      await chooseWorkspace(dir);
      if (workspace.error) {
        // Directory vanished between pick and read — reset so the user
        // sees the welcome screen again with an explanatory message.
        settings.workspace = null;
      }
    }
  } finally {
    busy.value = false;
  }
}

/** Open a recent workspace; fall back to the welcome screen if it's gone. */
async function openRecent(path: string): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  try {
    await chooseWorkspace(path);
    if (workspace.error) {
      settings.workspace = null;
    }
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="welcome">
    <div class="welcome-card">
      <svg class="welcome-logo" viewBox="0 0 24 24" width="72" height="72">
        <rect x="1.5" y="1.5" width="21" height="21" rx="5" fill="var(--accent)" />
        <rect x="7" y="6.5" width="10" height="1.8" rx="0.9" fill="var(--accent-text)" />
        <rect x="7" y="10.5" width="10" height="1.8" rx="0.9" fill="var(--accent-text)" opacity="0.85" />
        <rect x="7" y="14.5" width="6.5" height="1.8" rx="0.9" fill="var(--accent-text)" opacity="0.65" />
      </svg>
      <h1 class="welcome-title">{{ t("welcome.title") }}</h1>
      <p class="welcome-desc">{{ t("welcome.desc") }}</p>
      <button class="btn primary choose-btn" :disabled="busy" @click="pickWorkspace">
        {{ settings.workspace ? t("welcome.chooseAgain") : t("welcome.choose") }}
      </button>
      <p v-if="settings.workspace && workspace.error" class="welcome-warn">
        {{ t("welcome.workspaceMissing") }}
      </p>

      <div v-if="workspace.recents.length" class="recent-section">
        <div class="recent-title">{{ t("welcome.recent") }}</div>
        <div class="recent-list">
          <div
            v-for="path in workspace.recents"
            :key="path"
            class="recent-row"
            :title="path"
            @click="openRecent(path)"
          >
            <Icon name="folder" :size="18" class="recent-icon" />
            <div class="recent-text">
              <div class="recent-name">{{ baseName(path) }}</div>
              <div class="recent-path">{{ path }}</div>
            </div>
            <button
              class="icon-btn recent-remove"
              :title="t('welcome.removeRecent')"
              @click.stop="removeRecent(path)"
            >
              <Icon name="dismiss" :size="14" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.welcome {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow-y: auto;
}

.welcome-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  max-width: 560px;
  padding: 40px;
}

.welcome-logo {
  border-radius: 16px;
  margin-bottom: 22px;
}

.welcome-title {
  margin: 0 0 10px;
  font-size: 26px;
  font-weight: 650;
}

.welcome-desc {
  margin: 0 0 26px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-secondary);
}

.choose-btn {
  height: 38px;
  padding: 0 22px;
  font-size: 14.5px;
}

.welcome-warn {
  margin: 18px 0 0;
  font-size: 12.5px;
  color: var(--danger);
}

/* ---------- Recent workspaces ---------- */

.recent-section {
  width: 480px;
  max-width: 100%;
  margin-top: 34px;
  text-align: left;
}

.recent-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  letter-spacing: 0.3px;
  margin-bottom: 8px;
}

.recent-list {
  border: 1px solid var(--stroke);
  border-radius: var(--radius-md);
  background: var(--bg-card);
  overflow: hidden;
}

.recent-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  cursor: pointer;
  transition: background 0.12s ease;
}
.recent-row + .recent-row {
  border-top: 1px solid var(--stroke);
}
.recent-row:hover {
  background: var(--bg-hover);
}

.recent-icon {
  color: var(--accent);
  flex-shrink: 0;
}

.recent-text {
  flex: 1;
  min-width: 0;
}

.recent-name {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.recent-path {
  font-size: 11.5px;
  color: var(--text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.recent-remove {
  width: 26px;
  height: 26px;
  color: var(--text-tertiary);
  opacity: 0;
  flex-shrink: 0;
}
.recent-row:hover .recent-remove {
  opacity: 1;
}
.recent-remove:hover {
  color: var(--danger);
}
</style>
