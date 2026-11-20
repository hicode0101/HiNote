<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import Vditor from "vditor";
import "vditor/dist/index.css";
import { editor, onContentChange } from "@/stores/editor";
import { resolvedTheme } from "@/lib/theme";
import { i18n, t } from "@/lib/i18n";
import { savePastedImage, registerEditorView, registerFluidPaste, registerFluidMenuActions } from "@/lib/markdownActions";
import { markdownToDisplay, markdownToSource, refToAbsPath, displayUrl, absToRef, assetUrlToAbsPath } from "@/lib/imgSrc";
import { hasTreeFileData, readTreeFileData, type TreeFileInfo } from "@/lib/dropRef";
import { openFromContainer } from "@/stores/imgpreview";
import { activateFile } from "@/stores/workspace";
import { openEditorMenu, showToast } from "@/stores/ui";
import { confirmDialog } from "@/stores/dialog";
import { settings } from "@/stores/settings";
import { hlAuto } from "@/lib/hljsAuto";
import { api, baseName } from "@/lib/tauri";
import PreviewSearch from "./PreviewSearch.vue";

const host = ref<HTMLElement | null>(null);
const searchRef = ref<InstanceType<typeof PreviewSearch> | null>(null);
/** Height of the vditor toolbar; the search panel sits right below it. */
const toolbarOffset = ref(0);
let vditor: Vditor | null = null;
/** Generation of the open file this vditor instance is bound to. */
let boundGeneration = 0;

/**
 * WYSIWYG rendering contract: inside vditor, image refs always hold
 * webview-loadable URLs (asset protocol); `markdownToSource` converts them
 * back to portable note-relative paths before content reaches the store.
 */
function displayValue(): string {
  return markdownToDisplay(editor.content, editor.path ?? "");
}

function syncFromVditor(value: string): void {
  // vditor's input callback fires from timers — drop stale events that
  // belong to a file that was already switched away.
  if (boundGeneration !== editor.generation) return;
  onContentChange(markdownToSource(value, editor.path ?? ""));
}

/** Insert a pasted/picked image and render it at the cursor. */
async function insertImageFile(file: File): Promise<void> {
  if (!vditor) return;
  const gen = editor.generation;
  try {
    const rel = await savePastedImage(file);
    if (!rel || !editor.path || gen !== editor.generation) return;
    const abs = refToAbsPath(rel, editor.path);
    vditor.insertValue(`![](${abs ? displayUrl(abs) : rel})`);
  } catch {
    if (gen === editor.generation) vditor.tip(t("editor.pasteImageFailed"));
  }
}

// ===== Tree → editor drag-and-drop (same feature as classic mode) =====
// vditor has no public coords→position API, so refs insert at the caret.
// Images insert with a webview-loadable URL (markdownToSource converts it
// back to a portable relative path on sync, per the contract above).

function insertTreeFileRef(info: TreeFileInfo): void {
  if (!vditor || !editor.path) return;
  const rel = (absToRef(info.path, editor.path) || info.path).replace(/\\/g, "/");
  if (info.isImage) {
    const abs = refToAbsPath(rel, editor.path);
    vditor.insertValue(`![](${abs ? displayUrl(abs) : rel})`);
  } else {
    vditor.insertValue(`[${info.name || rel}](${rel})`);
  }
}

function onHostDragOver(e: DragEvent): void {
  if (hasTreeFileData(e.dataTransfer)) e.preventDefault();
}

function onHostDrop(e: DragEvent): void {
  const info = readTreeFileData(e.dataTransfer);
  if (!info) return;
  e.preventDefault();
  e.stopPropagation(); // keep vditor's own drop handling out
  insertTreeFileRef(info);
}

// ===== Deleting a workspace image offers to remove the physical file =====
// When an <img> disappears from the WYSIWYG doc and its src points inside the
// workspace, ask whether to delete the file on disk as well. Moves / duplicate
// refs are ignored (the src is still in the doc), and programmatic re-renders
// (setValue on file switch / reload) never trigger the prompt.

let setValueGuard = false;
let cutGuard = false;
const pendingLost = new Set<string>();
let lostTimer: ReturnType<typeof setTimeout> | null = null;

/** Absolute path for an img src when it points inside the workspace, else null. */
function workspaceImageFromSrc(src: string): string | null {
  const abs = assetUrlToAbsPath(src);
  if (!abs || !editor.path) return null;
  const ws = settings.workspace?.replace(/[\\/]+$/, "").toLowerCase();
  if (!ws) return null;
  const lower = abs.toLowerCase();
  if (lower !== ws && !lower.startsWith(ws + "\\") && !lower.startsWith(ws + "/")) return null;
  return abs;
}

/**
 * Suppress the removal watcher while vditor's DOM is updated from code.
 * MutationObserver callbacks run as a microtask, so the flag is cleared on a
 * macrotask — after the batch caused by `fn` has been delivered.
 */
function guardDomUpdate(fn: () => void): void {
  setValueGuard = true;
  try {
    fn();
  } finally {
    setTimeout(() => (setValueGuard = false), 0);
  }
}

function onHostCut(): void {
  // Cutting is moving-to-clipboard, not deleting: don't offer file removal.
  cutGuard = true;
  setTimeout(() => (cutGuard = false), 0);
}

function scanRemovedImages(mutations: MutationRecord[]): void {
  if (setValueGuard || cutGuard || !editor.path) return;
  const removed = new Set<string>();
  for (const m of mutations) {
    for (const n of m.removedNodes) {
      if (!(n instanceof HTMLElement)) continue;
      const imgs = n.tagName === "IMG" ? [n as HTMLImageElement] : Array.from(n.querySelectorAll("img"));
      for (const img of imgs) {
        const src = img.getAttribute("src");
        if (src) removed.add(src);
      }
    }
  }
  if (!removed.size) return;
  // Still present anywhere in the doc = moved or duplicated — not a deletion.
  const live = new Set<string>();
  host.value?.querySelectorAll("img").forEach((img) => live.add(img.getAttribute("src") ?? ""));
  for (const src of removed) if (!live.has(src)) pendingLost.add(src);
  if (!pendingLost.size || lostTimer) return;
  // Coalesce mutation bursts; re-check at flush time so a quick undo or an
  // in-flight drag re-insertion cancels the prompt.
  lostTimer = setTimeout(() => {
    lostTimer = null;
    const liveNow = new Set<string>();
    host.value?.querySelectorAll("img").forEach((img) => liveNow.add(img.getAttribute("src") ?? ""));
    const lost = [...pendingLost].filter((s) => !liveNow.has(s));
    pendingLost.clear();
    if (lost.length) void confirmDeleteImageFiles(lost);
  }, 250);
}

async function confirmDeleteImageFiles(srcs: string[]): Promise<void> {
  const targets: string[] = [];
  const names: string[] = [];
  for (const src of srcs) {
    const abs = workspaceImageFromSrc(src);
    if (abs) {
      targets.push(abs);
      names.push(baseName(abs));
    }
  }
  if (!targets.length) return;
  const list = new Intl.ListFormat(i18n.locale === "en-US" ? "en" : "zh").format(names);
  const ok = await confirmDialog({
    title: t("dialog.deleteImageTitle"),
    message: t("dialog.deleteImageBody", { names: list }),
    danger: true,
  });
  if (!ok) return;
  let failed = 0;
  for (const p of targets) {
    try {
      await api.deletePath(p);
    } catch {
      failed++;
    }
  }
  if (failed) showToast(t("dialog.deleteImageFailed"));
}

// Editable WYSIWYG surface: copy / paste / delete. When the right-click
// landed on an image, Delete also offers to remove the workspace file (the
// removal goes through the image watcher above).
let pendingMenuImage: HTMLImageElement | null = null;

function onHostContextMenu(e: MouseEvent): void {
  e.preventDefault();
  e.stopPropagation();
  pendingMenuImage =
    e.target instanceof Element ? (e.target.closest("img") as HTMLImageElement | null) : null;
  const sel = window.getSelection();
  const hasSel = !!(sel && sel.rangeCount && !sel.isCollapsed && host.value?.contains(sel.anchorNode));
  openEditorMenu(e.clientX, e.clientY, {
    canPaste: true,
    fluid: true,
    hasDelete: !!pendingMenuImage || hasSel,
  });
}

/**
 * Delete the context-menu target: the right-clicked image, or the current
 * text selection. execCommand keeps vditor's content sync + undo native; the
 * image removal then flows through the watcher's physical-file prompt.
 */
function fluidDeleteTarget(): void {
  const img = pendingMenuImage;
  pendingMenuImage = null;
  const wysiwyg = host.value?.querySelector(".vditor-wysiwyg") as HTMLElement | null;
  if (img && img.isConnected) {
    wysiwyg?.focus();
    const range = document.createRange();
    range.selectNode(img);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    if (document.execCommand("delete")) return;
    // Fallback: remove directly and let vditor re-sync via a synthetic input.
    img.remove();
    wysiwyg?.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  if (wysiwyg) wysiwyg.focus();
  document.execCommand("delete");
}

// Ctrl+F: custom DOM search over the WYSIWYG content instead of WebView2's
// find bar. Document-level capture so it works regardless of where focus is
// (right after mode switches the focus may be outside the editor).
function measureToolbar(): void {
  toolbarOffset.value =
    host.value?.querySelector(".vditor-toolbar")?.getBoundingClientRect().height ?? toolbarOffset.value;
}

function onDocKeydown(e: KeyboardEvent): void {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
    e.preventDefault();
    e.stopPropagation();
    measureToolbar();
    void searchRef.value?.open();
  }
}

// Links open inside HiNote, mirroring PreviewPane: workspace files activate
// (image refs open the gallery), web links go to the system browser, and bare
// navigation is always prevented. Capture phase beats vditor's own handling.
function onHostClick(e: MouseEvent): void {
  if (!(e.target instanceof Element)) return;
  const a = e.target.closest("a");
  if (!a) return;
  const href = a.getAttribute("href") ?? "";
  e.preventDefault();
  e.stopPropagation();
  if (!href) return;
  if (/^(https?|mailto):/i.test(href)) {
    void api.openUrl(href).catch(() => {});
    return;
  }
  if (/^(data|asset|blob|file):/i.test(href) || !editor.path) return;
  const abs = refToAbsPath(href, editor.path);
  if (abs) void activateFile(abs);
}

onMounted(() => {
  if (!host.value) return;
  registerEditorView(null); // toolbar actions target CM only
  boundGeneration = editor.generation;
  vditor = new Vditor(host.value, {
    mode: "wysiwyg",
    value: displayValue(),
    height: "100%",
    lang: i18n.locale === "en-US" ? "en_US" : "zh_CN",
    theme: resolvedTheme.value === "dark" ? "dark" : "classic",
    cdn: "/vditor",
    cache: { enable: false },
    counter: { enable: false },
    // Code block preview panes get vditor's own hljs highlighting (loaded
    // from our local /vditor cdn) — bare/unknown-language fences are
    // auto-detected by our MutationObserver enhancer below.
    preview: {
      hljs: { enable: true, style: "github" },
      markdown: { codeBlockPreview: true },
    },
    // Double-click on an image opens our own ImagePreview overlay;
    // disable vditor's built-in lightbox so it doesn't pop up alongside it.
    image: { isPreview: false },
    placeholder: baseName(editor.path ?? ""),
    undoDelay: 300,
    toolbar: [
      "headings",
      "bold",
      "italic",
      "strike",
      "|",
      "list",
      "ordered-list",
      "check",
      "|",
      "quote",
      "line",
      "code",
      "inline-code",
      "|",
      "link",
      "table",
      "upload",
      "|",
      "undo",
      "redo",
      "|",
      "edit-mode",
      "export",
      "fullscreen",
    ],
    upload: {
      accept: "image/*",
      multiple: false,
      // Vditor shows a handler's returned string as a tip and inserts nothing,
      // so we insert the image ourselves and always return null.
      handler: (files: File[]): null => {
        if (files.length) void insertImageFile(files[0]);
        return null;
      },
    },
    input: (value: string) => {
      syncFromVditor(value);
    },
  });
  // Double-click any rendered image in the WYSIWYG doc to open the preview.
  host.value?.addEventListener("dblclick", onHostDblClick);
  // Tree-file drops: capture phase runs before vditor's own drop handler.
  host.value?.addEventListener("dragover", onHostDragOver, true);
  host.value?.addEventListener("drop", onHostDrop, true);
  // Link clicks open inside HiNote (or system browser), never navigate.
  host.value?.addEventListener("click", onHostClick, true);
  host.value?.addEventListener("contextmenu", onHostContextMenu);
  host.value?.addEventListener("cut", onHostCut);
  document.addEventListener("keydown", onDocKeydown, true);
  // Clipboard-only menu paste target: insert at the vditor caret.
  registerFluidPaste((text) => vditor?.insertValue(text));
  // Context-menu action: delete target (image / selection).
  registerFluidMenuActions({ deleteTarget: fluidDeleteTarget });
  // Measure the toolbar (deferred: vditor builds its UI asynchronously).
  void nextTick(measureToolbar);
  // vditor renders bare/unknown-language fences as plaintext; re-highlight
  // their preview panes with auto-detection whenever the DOM changes. The
  // same stream feeds the workspace-image deletion watcher.
  domObserver = new MutationObserver((muts) => {
    enhanceBareCode();
    scanRemovedImages(muts);
  });
  if (host.value) domObserver.observe(host.value, { childList: true, subtree: true });
  enhanceBareCode();
});

let domObserver: MutationObserver | null = null;

/** Auto-highlight bare/unknown-language code blocks that vditor left plain. */
function enhanceBareCode(): void {
  host.value?.querySelectorAll<HTMLElement>(".vditor-wysiwyg__preview code").forEach((el) => {
    if (el.querySelector("span")) return; // known language: vditor highlighted it
    // Note: no dataset guard — vditor may fill the preview after our first
    // pass; the span check below terminates the observer feedback loop.
    const cls = [...el.classList].find((c) => c.startsWith("language-"));
    if (/language-(mermaid|flowchart|echarts|mindmap|plantuml|smiles|abc|graphviz|math)/.test(cls ?? "")) return;
    const auto = hlAuto(el.textContent ?? "", 1);
    if (auto) el.innerHTML = auto;
  });
}

/** Double-click an image in the WYSIWYG doc to open the gallery overlay. */
function onHostDblClick(e: MouseEvent): void {
  const img = (e.target as Element).closest("img");
  if (img && host.value) openFromContainer(host.value, img);
}

watch(resolvedTheme, (theme) => {
  vditor?.setTheme(theme === "dark" ? "dark" : "classic");
});

watch(
  () => editor.path,
  () => {
    if (vditor) {
      boundGeneration = editor.generation;
      guardDomUpdate(() => vditor!.setValue(displayValue()));
    }
  }
);

// Reload path: generation bumps without a path change (external-file reload).
watch(
  () => editor.generation,
  () => {
    if (vditor) {
      boundGeneration = editor.generation;
      guardDomUpdate(() => vditor!.setValue(displayValue()));
    }
  }
);

onUnmounted(() => {
  host.value?.removeEventListener("dblclick", onHostDblClick);
  host.value?.removeEventListener("dragover", onHostDragOver, true);
  host.value?.removeEventListener("drop", onHostDrop, true);
  host.value?.removeEventListener("click", onHostClick, true);
  host.value?.removeEventListener("contextmenu", onHostContextMenu);
  host.value?.removeEventListener("cut", onHostCut);
  document.removeEventListener("keydown", onDocKeydown, true);
  registerFluidPaste(null);
  registerFluidMenuActions(null);
  domObserver?.disconnect();
  domObserver = null;
  vditor?.destroy();
  vditor = null;
});
</script>

<template>
  <div class="fluid-host">
    <div ref="host" class="vditor-host"></div>
    <PreviewSearch
      ref="searchRef"
      :container="host"
      content-selector=".vditor-wysiwyg"
      :offset-top="toolbarOffset"
    />
  </div>
</template>

<style scoped>
.fluid-host {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.vditor-host {
  flex: 1;
  min-height: 0;
}
</style>

<style>
/* Non-scoped tweaks to blend vditor into the Fluent shell */
.fluid-host .vditor {
  border: none;
  background: var(--bg-layer);
  color: var(--text-primary);
}
.fluid-host .vditor-toolbar {
  background: var(--bg-subtle);
  border-bottom: 1px solid var(--stroke);
}
.fluid-host .vditor-content,
.fluid-host .vditor-reset {
  background: var(--bg-layer);
  color: var(--text-primary);
}
.fluid-host .vditor-wysiwyg pre.vditor-reset {
  background: var(--bg-layer);
  color: var(--text-primary);
}
/* Dark theme: keep WYSIWYG code blocks dark like the rest of the shell. */
[data-theme="dark"] .fluid-host .vditor--dark .vditor-wysiwyg__block,
[data-theme="dark"] .fluid-host .vditor--dark .vditor-wysiwyg pre.vditor-reset {
  background: var(--bg-subtle);
  color: var(--text-primary);
}
[data-theme="dark"] .fluid-host .vditor--dark .vditor-wysiwyg pre.vditor-reset code {
  background: transparent;
  color: var(--text-primary);
}
</style>
