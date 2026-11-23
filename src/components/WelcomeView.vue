<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { listen } from "@tauri-apps/api/event";
import { t } from "@/lib/i18n";
import { api, baseName } from "@/lib/tauri";
import { workspace, chooseWorkspace, removeRecent } from "@/stores/workspace";
import { settings } from "@/stores/settings";
import { showToast } from "@/stores/ui";
import Icon from "./Icon.vue";

const busy = ref(false);

async function pickWorkspace(): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  try {
    const dir = await api.pickDirectory();
    if (dir) {
      await openWorkspace(dir);
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
    await openWorkspace(path);
  } finally {
    busy.value = false;
  }
}

/** Shared workspace-open path; resets on failure so the welcome screen shows. */
async function openWorkspace(dir: string): Promise<void> {
  await chooseWorkspace(dir);
  if (workspace.error) {
    settings.workspace = null;
  }
}

// ===== Drop a folder from Explorer to open it as the workspace =====
// dragDropEnabled is false in tauri.conf.json, so HTML5 drag events reach the
// webview (the tree→editor drags keep working) — but WebView2 hides dropped
// paths from page JS (`File.path` is Electron-only). The Rust drophook
// resolves the paths: the page forwards the dropped File objects via
// postMessageWithAdditionalObjects and gets a `dropped-paths` event back.

/** WebView2 content API for handing File objects to the native host. */
function canForwardToHost(): boolean {
  return typeof (window as unknown as { chrome?: { webview?: { postMessageWithAdditionalObjects?: unknown } } })
    .chrome?.webview?.postMessageWithAdditionalObjects === "function";
}

function forwardFilesToHost(files: FileList): void {
  (window as unknown as { chrome: { webview: { postMessageWithAdditionalObjects: (msg: string, objs: FileList) => void } } })
    .chrome.webview.postMessageWithAdditionalObjects("hinote-drop-files", files);
}

let unlistenDrop: (() => void) | null = null;

onMounted(async () => {
  try {
    unlistenDrop = await listen<string[]>("dropped-paths", (ev) => {
      const dir = ev.payload.find(Boolean);
      if (!dir || busy.value) return;
      busy.value = true;
      void (async () => {
        await openWorkspace(dir);
        if (workspace.error) {
          // Not a folder (or unreadable) — back to the welcome screen.
          showToast(t("welcome.dropFailed"));
        }
      })().finally(() => {
        busy.value = false;
      });
    });
  } catch {
    // Outside Tauri there is no event bridge.
  }
});
onUnmounted(() => {
  unlistenDrop?.();
  unlistenDrop = null;
});

const dragActive = ref(false);
let dragDepth = 0;

function isExternalDrag(e: DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes("Files");
}

function onDragEnter(e: DragEvent): void {
  if (!isExternalDrag(e)) return;
  e.preventDefault();
  dragDepth++;
  dragActive.value = true;
}

function onDragOver(e: DragEvent): void {
  if (!isExternalDrag(e)) return;
  e.preventDefault();
  e.dataTransfer!.dropEffect = "copy";
}

function onDragLeave(e: DragEvent): void {
  if (!isExternalDrag(e)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) dragActive.value = false;
}

function onDrop(e: DragEvent): void {
  dragDepth = 0;
  dragActive.value = false;
  if (!isExternalDrag(e) || busy.value) return;
  e.preventDefault();
  const files = e.dataTransfer?.files;
  if (!files?.length) return;
  // WebView2 keeps the absolute paths native-side; ask the drophook to
  // resolve them (result arrives via the `dropped-paths` listener).
  if (canForwardToHost()) {
    forwardFilesToHost(files);
  } else {
    showToast(t("welcome.dropUnsupported"));
  }
}
</script>

<template>
  <div
    class="welcome"
    @dragenter="onDragEnter"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <!-- Explorer folder drag-over feedback; pointer-events keep the drag
         counters stable on the root element. -->
    <div v-if="dragActive" class="drop-overlay">
      <div class="drop-box">
        <Icon name="folder" :size="40" class="drop-icon" />
        <div class="drop-hint">{{ t("welcome.dropHint") }}</div>
      </div>
    </div>
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
  position: relative;
}

/* ---------- Folder drag-over overlay ---------- */

.drop-overlay {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  background: rgba(0, 0, 0, 0.2);
}

.drop-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px 48px;
  border: 2px dashed var(--accent);
  border-radius: var(--radius-md);
  background: var(--bg-card);
}

.drop-icon {
  color: var(--accent);
}

.drop-hint {
  font-size: 14px;
  font-weight: 600;
  color: var(--accent);
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
