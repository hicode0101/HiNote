<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { t } from "@/lib/i18n";
import { ui } from "@/stores/ui";
import { api } from "@/lib/tauri";
import { APP_AUTHOR, APP_HOMEPAGE } from "@/lib/appInfo";
import { useDraggableCard } from "@/lib/dialogDrag";
import Icon from "./Icon.vue";

const version = ref("");

// Drag-to-move via the header. The dialog is mounted with `v-if`, so a
// fresh mount always starts centered (no reset watch needed).
const { cardStyle, onHeaderPointerDown } = useDraggableCard();

onMounted(async () => {
  try {
    version.value = await api.appVersion();
  } catch {
    // Running outside Tauri (e.g. plain browser) — leave the version empty.
  }
  document.addEventListener("keydown", onKeydown);
});

onUnmounted(() => document.removeEventListener("keydown", onKeydown));

function onKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape") ui.aboutOpen = false;
}

function openHomepage(): void {
  void api.openUrl(APP_HOMEPAGE).catch(() => {});
}
</script>

<template>
  <Teleport to="body">
    <transition name="fade">
      <!-- 遮罩层不响应点击：通过关闭按钮或 Esc 显式关闭 -->
      <div class="about-overlay">
        <div class="about-card" :style="cardStyle" role="dialog" :aria-label="t('about.title')">
          <header class="about-header" @pointerdown="onHeaderPointerDown">
            <h2 class="about-title">{{ t("about.title") }}</h2>
            <button
              class="about-close"
              type="button"
              :aria-label="t('settings.close')"
              @click="ui.aboutOpen = false"
            >
              <Icon name="dismiss" :size="16" />
            </button>
          </header>

          <div class="about-body">
            <svg class="about-logo" viewBox="0 0 24 24" width="76" height="76" aria-hidden="true">
              <rect x="1.5" y="1.5" width="21" height="21" rx="5" fill="var(--accent)" />
              <rect x="7" y="6.5" width="10" height="1.8" rx="0.9" fill="var(--accent-text)" />
              <rect x="7" y="10.5" width="10" height="1.8" rx="0.9" fill="var(--accent-text)" opacity="0.85" />
              <rect x="7" y="14.5" width="6.5" height="1.8" rx="0.9" fill="var(--accent-text)" opacity="0.65" />
            </svg>

            <div class="about-name">{{ t("app.name") }}</div>
            <div class="about-version">{{ version ? `v${version}` : "-" }}</div>
            <p class="about-desc">{{ t("about.desc") }}</p>

            <div class="about-meta">
              <div class="about-row">
                <span class="about-label">{{ t("about.homepage") }}</span>
                <a href="#" class="about-link" @click.prevent="openHomepage">{{ APP_HOMEPAGE }}</a>
              </div>
              <div class="about-row">
                <span class="about-label">{{ t("about.author") }}</span>
                <span>{{ APP_AUTHOR }}</span>
              </div>
            </div>
          </div>

          <footer class="about-footer">
            <button class="about-ok" type="button" @click="ui.aboutOpen = false">
              {{ t("settings.close") }}
            </button>
          </footer>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
.about-overlay {
  position: fixed;
  inset: 0;
  z-index: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
}

.about-card {
  display: flex;
  flex-direction: column;
  width: 560px;
  max-width: calc(100vw - 48px);
  padding: 20px 24px 0;
  background: var(--bg-layer);
  border: 1px solid var(--stroke);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-dialog);
}

.about-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 2px;
  /* 标题栏 = 拖动把手 */
  cursor: grab;
  user-select: none;
}

.about-title {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 20px;
  font-weight: 650;
}

.about-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}
.about-close:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.about-close:active {
  background: var(--bg-active);
}

.about-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 14px 24px 28px;
  text-align: center;
}

.about-logo {
  border-radius: 16px;
  margin-bottom: 16px;
}

.about-name {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.3;
}

.about-version {
  margin-top: 6px;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 2px;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}

.about-desc {
  margin: 10px 0 14px;
  font-size: 13.5px;
  color: var(--text-secondary);
  line-height: 1.6;
}

/* Label/value rows stay left-aligned inside the centered column */
.about-meta {
  width: fit-content;
  max-width: 100%;
  text-align: left;
  font-size: 13.5px;
}

.about-row {
  display: flex;
  gap: 4px;
  margin-top: 6px;
}

.about-label {
  flex-shrink: 0;
  color: var(--text-secondary);
}

.about-link {
  color: var(--accent);
  text-decoration: none;
  word-break: break-all;
}
.about-link:hover {
  text-decoration: underline;
}

.about-footer {
  display: flex;
  justify-content: flex-end;
  margin: 0 -24px;
  padding: 14px 24px;
  border-top: 1px solid var(--stroke);
}

.about-ok {
  padding: 6px 18px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: var(--accent-text);
  font-family: inherit;
  font-size: 13.5px;
  cursor: pointer;
  transition: filter 0.15s ease;
}
.about-ok:hover {
  filter: brightness(1.08);
}
.about-ok:active {
  filter: brightness(0.95);
}
</style>
