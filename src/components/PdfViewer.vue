<script setup lang="ts">
// PDF 阅读器（pdf.js）：只读连续滚动 + 页码跳转 / 适应宽度 / 缩放 + 文本层
// 选择复制。二进制数据经 read_binary_file（字节组）加载（HiEditor v1.7 同款交互）。
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { t } from "@/lib/i18n";
import { api } from "@/lib/tauri";
import { editor } from "@/stores/editor";
import Icon from "./Icon.vue";

// pdf.js is loaded lazily so the ~1 MB library stays out of the main bundle.
type PdfJs = typeof import("pdfjs-dist");
let pdfjs: PdfJs | null = null;
async function getPdfJs(): Promise<PdfJs> {
  if (!pdfjs) {
    pdfjs = await import("pdfjs-dist");
    const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  }
  return pdfjs;
}

const MIN_SCALE = 0.2;
const MAX_SCALE = 5;

const viewEl = ref<HTMLElement | null>(null);
const loading = ref(false);
const error = ref("");
const totalPages = ref(0);
const currentPage = ref(1);
const scale = ref(1);
const zoomPct = computed(() => `${Math.round(scale.value * 100)}%`);

type PdfDoc = PDFDocumentProxy;
type PdfPage = PDFPageProxy;
type PdfTask = ReturnType<typeof import("pdfjs-dist").getDocument>;

let doc: PdfDoc | null = null;
let loadingTask: PdfTask | null = null;
let renderSeq = 0; // 渲染会话号：切换文件/缩放后旧的逐页渲染循环作废
let pageObserver: IntersectionObserver | null = null;
let pendingPage: number | null = null;

function clampScale(s: number): number {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));
}

async function firstPageSize(d: PdfDoc): Promise<{ width: number; height: number }> {
  const page: PdfPage = await d.getPage(1);
  return page.getViewport({ scale: 1 });
}

/** Load and render the currently open PDF (safe to call repeatedly). */
async function render(): Promise<void> {
  if (!editor.path || viewEl.value == null) return;
  const pdfjsLib = await getPdfJs();
  const seq = ++renderSeq;
  loading.value = true;
  error.value = "";
  try {
    const bytes = await api.readBinaryFile(editor.path);
    if (seq !== renderSeq) return;
    const data = new Uint8Array(bytes);
    loadingTask = pdfjsLib.getDocument({ data });
    doc = await loadingTask.promise;
    if (seq !== renderSeq) return;
    totalPages.value = doc.numPages;
    currentPage.value = 1;
    pendingPage = null;
    // Default zoom: fit page width.
    const base = await firstPageSize(doc);
    scale.value = clampScale(((viewEl.value?.clientWidth || 800) - 48) / base.width);
    viewEl.value.innerHTML = "";
    setupPageObserver();
    for (let n = 1; n <= doc.numPages; n++) {
      if (seq !== renderSeq) return; // switched file / re-zoomed: abort
      await renderPage(doc, n);
    }
  } catch (e) {
    if (seq === renderSeq) error.value = `${t("pdf.openFailed")}: ${String(e)}`;
  } finally {
    if (seq === renderSeq) loading.value = false;
  }
}

async function renderPage(d: PdfDoc, n: number): Promise<void> {
  if (!viewEl.value || !doc) return;
  const pdfjsLib = await getPdfJs();
  const page: PdfPage = await d.getPage(n);
  const s = scale.value;
  const viewport = page.getViewport({ scale: s });
  const holder = document.createElement("div");
  holder.className = "pdf-page";
  holder.dataset.page = String(n);
  holder.style.width = `${Math.round(viewport.width)}px`;
  holder.style.height = `${Math.round(viewport.height)}px`;
  holder.style.setProperty("--scale-factor", String(s));
  const canvas = document.createElement("canvas");
  // Render at devicePixelRatio for crispness; the transform must match or
  // pdf.js draws at 1x into the larger bitmap (content shrunk to a corner).
  const dpr = Math.min(window.devicePixelRatio || 1, 2) || 1;
  canvas.width = Math.floor(viewport.width * dpr);
  canvas.height = Math.floor(viewport.height * dpr);
  canvas.style.width = `${Math.round(viewport.width)}px`;
  canvas.style.height = `${Math.round(viewport.height)}px`;
  holder.appendChild(canvas);
  const textDiv = document.createElement("div");
  textDiv.className = "textLayer";
  textDiv.style.setProperty("--total-scale-factor", String(s));
  holder.appendChild(textDiv);
  viewEl.value.appendChild(holder);
  pageObserver?.observe(holder);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  await page.render({
    canvas,
    canvasContext: ctx,
    viewport,
    transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
  }).promise;
  const tl = new pdfjsLib.TextLayer({
    textContentSource: page.streamTextContent(),
    container: textDiv,
    viewport,
  });
  await tl.render();
  if (pendingPage === n) {
    pendingPage = null;
    holder.scrollIntoView({ block: "start" });
  }
}

/** Re-render all pages in place (zoom change). */
async function rerenderAll(): Promise<void> {
  if (!doc || !viewEl.value) return;
  const seq = ++renderSeq;
  loading.value = true;
  try {
    viewEl.value.innerHTML = "";
    setupPageObserver();
    for (let n = 1; n <= doc.numPages; n++) {
      if (seq !== renderSeq) return;
      await renderPage(doc, n);
    }
  } finally {
    if (seq === renderSeq) loading.value = false;
  }
}

function applyScale(s: number): void {
  scale.value = clampScale(s);
  void rerenderAll();
}

function zoom(delta: number): void {
  applyScale(scale.value + delta);
}

function fitWidth(): void {
  if (!doc) return;
  firstPageSize(doc).then((base) => {
    applyScale(((viewEl.value?.clientWidth || 800) - 48) / base.width);
  });
}

function goToPage(n: number): void {
  if (!doc) return;
  n = Math.max(1, Math.min(doc.numPages, Math.round(n) || 1));
  currentPage.value = n;
  const holder = viewEl.value?.querySelector<HTMLElement>(`.pdf-page[data-page="${n}"]`);
  if (holder) {
    holder.scrollIntoView({ block: "start" });
  } else {
    pendingPage = n; // not rendered yet: jump when renderPage finishes it
  }
}

function onPageInputKey(e: KeyboardEvent): void {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const input = e.target as HTMLInputElement;
  goToPage(parseInt(input.value, 10));
  input.blur();
}

/** Scroll tracking: most-visible page becomes the current one. */
function setupPageObserver(): void {
  pageObserver?.disconnect();
  if (!viewEl.value) return;
  pageObserver = new IntersectionObserver(
    (entries) => {
      let best: IntersectionObserverEntry | null = null;
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        if (!best || en.intersectionRatio > best.intersectionRatio) best = en;
      }
      if (!best) return;
      const n = parseInt((best.target as HTMLElement).dataset.page ?? "", 10);
      if (n) currentPage.value = n;
    },
    { root: viewEl.value, threshold: [0, 0.25, 0.5, 0.75, 1] }
  );
}

// Ctrl+wheel zoom (stop propagation: the image preview also listens globally).
function onWheel(e: WheelEvent): void {
  if (!e.ctrlKey) return;
  e.preventDefault();
  e.stopPropagation();
  zoom(e.deltaY < 0 ? 0.1 : -0.1);
}

// Reload when another file is opened (or the same file is re-opened after reload).
watch(
  () => [editor.path, editor.generation] as const,
  ([path]) => {
    if (!path) return;
    void render();
  }
);

onMounted(() => {
  viewEl.value?.addEventListener("wheel", onWheel, { passive: false });
  if (editor.path) void render();
});

onUnmounted(() => {
  renderSeq++; // abort any in-flight render loop
  viewEl.value?.removeEventListener("wheel", onWheel);
  pageObserver?.disconnect();
  pageObserver = null;
  void loadingTask?.destroy();
  loadingTask = null;
  doc = null;
});
</script>

<template>
  <div class="pdf-host">
    <div class="pdf-bar">
      <button
        class="icon-btn"
        :title="t('pdf.prevPage')"
        :disabled="currentPage <= 1"
        @click="goToPage(currentPage - 1)"
      >
        <Icon name="chevronLeft" :size="15" />
      </button>
      <input
        class="pdf-page-input"
        type="text"
        :value="currentPage"
        spellcheck="false"
        @keydown="onPageInputKey"
      />
      <span class="pdf-page-total">/ {{ totalPages }}</span>
      <button
        class="icon-btn"
        :title="t('pdf.nextPage')"
        :disabled="totalPages > 0 && currentPage >= totalPages"
        @click="goToPage(currentPage + 1)"
      >
        <Icon name="chevronRight" :size="15" />
      </button>
      <span class="pdf-sep"></span>
      <button class="icon-btn" :title="t('pdf.zoomOut')" @click="zoom(-0.2)">
        <Icon name="zoomOut" :size="15" />
      </button>
      <span class="pdf-zoom-level">{{ zoomPct }}</span>
      <button class="icon-btn" :title="t('pdf.zoomIn')" @click="zoom(0.2)">
        <Icon name="zoomIn" :size="15" />
      </button>
      <button class="icon-btn" :title="t('pdf.fitWidth')" @click="fitWidth">
        <Icon name="fit" :size="15" />
      </button>
      <span v-if="loading" class="pdf-loading">{{ t("pdf.loading") }}</span>
    </div>

    <div v-if="error" class="pdf-error">{{ error }}</div>
    <div ref="viewEl" class="pdf-view"></div>
  </div>
</template>

<style scoped>
.pdf-host {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-subtle);
}

.pdf-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 38px;
  padding: 0 12px;
  border-bottom: 1px solid var(--stroke);
  background: var(--bg-layer);
  flex-shrink: 0;
}
.pdf-sep {
  width: 1px;
  height: 18px;
  background: var(--stroke-strong);
  margin: 0 4px;
}
.pdf-page-input {
  width: 44px;
  height: 26px;
  text-align: center;
  font-size: 13px;
  border: 1px solid var(--stroke-control);
  border-radius: var(--radius-sm);
  background: var(--bg-layer);
  color: var(--text-primary);
  outline: none;
}
.pdf-page-input:focus {
  border-color: var(--accent);
}
.pdf-page-total {
  font-size: 12.5px;
  color: var(--text-secondary);
  white-space: nowrap;
}
.pdf-zoom-level {
  min-width: 44px;
  text-align: center;
  font-size: 12.5px;
  color: var(--text-primary);
  user-select: none;
}
.pdf-loading {
  margin-left: 8px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.pdf-error {
  margin: 16px;
  padding: 12px 16px;
  border: 1px solid var(--danger);
  border-radius: var(--radius-sm);
  color: var(--danger);
  font-size: 13px;
  user-select: text;
}
</style>

<style>
/* Unscoped: pages + text layer are created imperatively. */
.pdf-view {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 16px;
}
/* Text layer needs per-element selectability (global user-select: none). */
.pdf-view,
.pdf-view * {
  user-select: text;
}
.pdf-page {
  position: relative;
  margin: 0 auto 16px;
  background: #fff;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.18);
}
.pdf-page canvas {
  display: block;
}
.pdf-page .textLayer {
  position: absolute;
  inset: 0;
  overflow: hidden;
  line-height: 1;
  opacity: 1;
}
.pdf-page .textLayer span {
  color: transparent;
  position: absolute;
  white-space: pre;
  cursor: text;
  transform-origin: 0 0;
}
.pdf-page .textLayer ::selection,
.pdf-page .textLayer span::selection {
  background: rgba(0, 100, 220, 0.35);
}
[data-theme="dark"] .pdf-page {
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
}
</style>
