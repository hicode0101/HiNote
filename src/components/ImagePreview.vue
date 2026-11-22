<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { t } from "@/lib/i18n";
import { api } from "@/lib/tauri";
import { arrayBufferToBase64, extFromMime } from "@/lib/markdownActions";
import {
  imgPreview,
  currentImage,
  closeImagePreview,
  stepPreview,
  zoomPreview,
  rotatePreview,
  resetPreview,
} from "@/stores/imgpreview";
import Icon from "./Icon.vue";

const toast = ref("");
let toastTimer: ReturnType<typeof setTimeout> | null = null;

function showToast(text: string): void {
  toast.value = text;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = ""), 2600);
}

function onWheel(e: WheelEvent): void {
  zoomPreview(e.deltaY < 0 ? 1.1 : 1 / 1.1);
}

// --- Drag to pan when zoomed in ---
const dragging = ref(false);
let lastX = 0;
let lastY = 0;

function onPointerDown(e: PointerEvent): void {
  if (imgPreview.zoom <= 1) return;
  dragging.value = true;
  lastX = e.clientX;
  lastY = e.clientY;
  (e.target as Element).setPointerCapture(e.pointerId);
}
function onPointerMove(e: PointerEvent): void {
  if (!dragging.value) return;
  imgPreview.tx += e.clientX - lastX;
  imgPreview.ty += e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
}
function onPointerUp(): void {
  dragging.value = false;
}

/** Double-click toggles between fit view and a close-up. */
function onImageDblClick(): void {
  if (imgPreview.zoom > 1) resetPreview();
  else {
    resetPreview();
    imgPreview.zoom = 2.5;
  }
}

function onKeydown(e: KeyboardEvent): void {
  if (!imgPreview.open) return;
  if (e.key === "Escape") closeImagePreview();
  else if (e.key === "ArrowLeft") stepPreview(-1);
  else if (e.key === "ArrowRight") stepPreview(1);
  else if (e.key === "+" || e.key === "=") zoomPreview(1.2);
  else if (e.key === "-") zoomPreview(1 / 1.2);
  else if (e.key.toLowerCase() === "r") rotatePreview();
}
onMounted(() => document.addEventListener("keydown", onKeydown));
onUnmounted(() => document.removeEventListener("keydown", onKeydown));

const transform = computed(
  () =>
    `translate(${imgPreview.tx}px, ${imgPreview.ty}px) scale(${imgPreview.zoom}) rotate(${imgPreview.rotation}deg)`
);

async function copyImage(): Promise<void> {
  const img = currentImage();
  if (!img) return;
  try {
    if (img.absPath) {
      await api.copyImageToClipboard({ path: img.absPath });
    } else {
      const res = await fetch(img.url);
      const b64 = arrayBufferToBase64(await res.arrayBuffer());
      await api.copyImageToClipboard({ dataBase64: b64 });
    }
    showToast(t("preview.copyOk"));
  } catch {
    showToast(t("preview.copyFailed"));
  }
}

async function saveImageAs(): Promise<void> {
  const img = currentImage();
  if (!img) return;
  try {
    let saved: string | null;
    if (img.absPath) {
      saved = await api.saveImageAs({ path: img.absPath, suggestedName: img.name });
    } else {
      const res = await fetch(img.url);
      const ext = extFromMime(res.headers.get("content-type") || "image/png");
      const b64 = arrayBufferToBase64(await res.arrayBuffer());
      saved = await api.saveImageAs({ dataBase64: b64, ext, suggestedName: img.name });
    }
    if (saved) showToast(t("preview.savedTo", { path: saved }));
  } catch {
    showToast(t("preview.saveFailed"));
  }
}
</script>

<template>
  <Teleport to="body">
    <transition name="imgfade">
      <!-- 遮罩层不响应点击：通过关闭按钮 / Esc / 工具栏操作显式关闭 -->
      <div v-if="imgPreview.open" class="img-preview-overlay" @wheel.prevent="onWheel">
        <img
          :key="imgPreview.index"
          class="preview-img"
          :class="{ grabbable: imgPreview.zoom > 1, noanim: dragging }"
          :src="currentImage()?.url ?? ''"
          :alt="currentImage()?.name ?? ''"
          :title="currentImage()?.name ?? ''"
          :style="{ transform }"
          draggable="false"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
          @dblclick.prevent="onImageDblClick"
        />

        <button class="preview-close" :title="t('preview.close')" @click="closeImagePreview">
          <Icon name="dismiss" :size="18" />
        </button>

        <div class="preview-toolbar">
          <span class="preview-index">
            {{ imgPreview.index + 1 }} / {{ imgPreview.images.length }}
          </span>
          <span class="toolbar-divider" />
          <button
            class="tool-btn"
            :title="t('preview.prev')"
            :disabled="imgPreview.images.length < 2"
            @click="stepPreview(-1)"
          >
            <Icon name="chevronLeft" :size="18" />
          </button>
          <button
            class="tool-btn"
            :title="t('preview.next')"
            :disabled="imgPreview.images.length < 2"
            @click="stepPreview(1)"
          >
            <Icon name="chevronRight" :size="18" />
          </button>
          <button class="tool-btn" :title="t('preview.zoomIn')" @click="zoomPreview(1.25)">
            <Icon name="zoomIn" :size="18" />
          </button>
          <button class="tool-btn" :title="t('preview.zoomOut')" @click="zoomPreview(1 / 1.25)">
            <Icon name="zoomOut" :size="18" />
          </button>
          <button class="tool-btn" :title="t('preview.rotate')" @click="rotatePreview()">
            <Icon name="rotateLeft" :size="18" />
          </button>
          <button class="tool-btn" :title="t('preview.fit')" @click="resetPreview()">
            <Icon name="fit" :size="18" />
          </button>
          <span class="toolbar-divider" />
          <button class="tool-btn" :title="t('preview.copy')" @click="copyImage">
            <Icon name="copy" :size="18" />
          </button>
          <button class="tool-btn" :title="t('preview.saveAs')" @click="saveImageAs">
            <Icon name="download" :size="18" />
          </button>
        </div>

        <transition name="imgfade">
          <div v-if="toast" class="preview-toast">{{ toast }}</div>
        </transition>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
.img-preview-overlay {
  position: fixed;
  inset: 0;
  z-index: 950;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
}

.preview-img {
  max-width: 88vw;
  max-height: 78vh;
  object-fit: contain;
  border-radius: 4px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
  transition: transform 0.14s ease;
  user-select: none;
  -webkit-user-drag: none;
}
.preview-img.noanim {
  transition: none;
}
.preview-img.grabbable {
  cursor: grab;
}
.preview-img.grabbable:active {
  cursor: grabbing;
}

.preview-close {
  position: fixed;
  top: 16px;
  right: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  border: none;
  background: var(--bg-layer);
  color: var(--text-primary);
  box-shadow: var(--shadow-flyout);
  cursor: pointer;
  transition: background 0.15s;
}
.preview-close:hover {
  background: var(--bg-subtle);
}

.preview-toolbar {
  position: fixed;
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid var(--stroke);
  background: var(--bg-layer);
  box-shadow: var(--shadow-flyout);
}

.preview-index {
  min-width: 52px;
  text-align: center;
  font-size: 13px;
  color: var(--text-secondary);
}

.toolbar-divider {
  width: 1px;
  height: 20px;
  margin: 0 6px;
  background: var(--stroke);
}

.tool-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  transition: background 0.15s;
}
.tool-btn:hover {
  background: var(--bg-subtle);
}
.tool-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.tool-btn:disabled:hover {
  background: transparent;
}

.preview-toast {
  position: fixed;
  bottom: 96px;
  left: 50%;
  transform: translateX(-50%);
  max-width: 70vw;
  padding: 8px 16px;
  border-radius: 6px;
  background: var(--bg-layer);
  color: var(--text-primary);
  font-size: 13px;
  border: 1px solid var(--stroke);
  box-shadow: var(--shadow-flyout);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.imgfade-enter-active,
.imgfade-leave-active {
  transition: opacity 0.16s ease;
}
.imgfade-enter-from,
.imgfade-leave-to {
  opacity: 0;
}
</style>
