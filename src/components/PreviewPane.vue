<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import MarkdownIt from "markdown-it";
import taskListsPlugin from "markdown-it-task-lists";
import hljs from "highlight.js";
import { refToAbsPath, displayUrl } from "@/lib/imgSrc";
import { registerSplitPreview, onPreviewScrolled, syncPreviewFromEditor } from "@/lib/splitSync";
import { api } from "@/lib/tauri";
import { editor } from "@/stores/editor";
import { activateFile } from "@/stores/workspace";
import { openEditorMenu } from "@/stores/ui";
import { openFromContainer } from "@/stores/imgpreview";
import { hlAuto } from "@/lib/hljsAuto";
import PreviewSearch from "./PreviewSearch.vue";

const scrollEl = ref<HTMLElement | null>(null);
const mdEl = ref<HTMLElement | null>(null);
const searchRef = ref<InstanceType<typeof PreviewSearch> | null>(null);

/** Double-click an image in the preview to open the gallery overlay. */
function onDblClick(e: MouseEvent): void {
  const img = (e.target as Element).closest("img");
  const container = (e.currentTarget as Element).querySelector(".md-preview");
  if (img && container) openFromContainer(container as HTMLElement, img);
}

// Read-only surface: clipboard menu with copy only (paste stays grayed).
function onContextMenu(e: MouseEvent): void {
  e.preventDefault();
  openEditorMenu(e.clientX, e.clientY, { clipboardOnly: true, canPaste: false });
}

// Ctrl+F opens our own preview search instead of WebView2's find bar.
function onDocKey(e: KeyboardEvent): void {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
    e.preventDefault();
    e.stopPropagation();
    void searchRef.value?.open();
  }
}

/** 分屏模式下预览区滚动驱动编辑区同步（其他视图不需要）。 */
function onScroll(): void {
  if (editor.view === "split") onPreviewScrolled();
}

onMounted(() => {
  document.addEventListener("keydown", onDocKey, true);
  registerSplitPreview(scrollEl.value);
  void resolveHtmlImages();
});
onUnmounted(() => {
  document.removeEventListener("keydown", onDocKey, true);
  registerSplitPreview(null);
});

/**
 * Links open inside HiNote: workspace files activate (image refs open the
 * gallery), web links go to the system browser. Bare navigation (which would
 * leave the app) is always prevented.
 */
function onClick(e: MouseEvent): void {
  if (!(e.target instanceof Element)) return;
  const a = e.target.closest("a");
  if (!a) return;
  const href = a.getAttribute("href") ?? "";
  e.preventDefault();
  if (!href) return;
  if (/^(https?|mailto):/i.test(href)) {
    void api.openUrl(href).catch(() => {});
    return;
  }
  if (/^(data|asset|blob|file):/i.test(href) || !editor.path) return;
  const abs = refToAbsPath(href, editor.path);
  if (abs) void activateFile(abs);
}

// Common languages for auto-detection live in lib/hljsAuto (shared with the
// fluid editor's bare-fence enhancement).

const md: MarkdownIt = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: false,
  highlight(str: string, lang: string): string {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return `<pre class="hljs"><code>${hljs.highlight(str, {
          language: lang,
          ignoreIllegals: true,
        }).value}</code></pre>`;
      } catch {
        /* fall through */
      }
    }
    // Untagged (or unknown) fence: try language auto-detection.
    const auto = hlAuto(str);
    if (auto) return `<pre class="hljs"><code>${auto}</code></pre>`;
    return `<pre class="hljs"><code>${md.utils.escapeHtml(str)}</code></pre>`;
  },
});
md.use(taskListsPlugin, { enabled: true });

// 分屏滚动同步锚点：给块级开标签标注源码起始行号（0 基），渲染为
// data-line 属性，供 splitSync 把滚动位置映射回源码行。仅开标签
// （nesting !== -1）经 renderToken 输出属性；fence/html_block 等自渲染
// token 不产出锚点，同步时自动落到最近的上方锚点。
md.core.ruler.push("hinote_data_line", (state) => {
  for (const token of state.tokens) {
    if (token.map && token.nesting !== -1) {
      token.attrSet("data-line", String(token.map[0]));
    }
  }
});

// 默认 fence 渲染器遇到以 <pre 开头的 highlight 结果（本文件的 hljs
// 路径全部如此）会原样返回、丢弃 token 属性。补一个规则把 data-line
// 放回 <pre> 上，让代码块也能作为分屏滚动同步锚点。
const defaultFence = md.renderer.rules.fence;
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const html = defaultFence
    ? defaultFence(tokens, idx, options, env, self)
    : self.renderToken(tokens, idx, options);
  const map = tokens[idx].map;
  if (!map) return html;
  return html.replace("<pre", `<pre data-line="${map[0]}"`);
};

// Inline code gets auto-detected highlighting too (short snippets only).
const defaultInlineCode = md.renderer.rules.code_inline;
md.renderer.rules.code_inline = (tokens, idx, options, env, self) => {
  const content = tokens[idx].content;
  if (content && content.length <= 200) {
    const auto = hlAuto(content, 2);
    if (auto) return `<code class="hljs">${auto}</code>`;
  }
  return defaultInlineCode
    ? defaultInlineCode(tokens, idx, options, env, self)
    : self.renderToken(tokens, idx, options);
};

const defaultImage = md.renderer.rules.image;
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const src = token.attrGet("src");
  if (src && !/^(https?|data|asset|blob):/i.test(src)) {
    token.attrSet("src", resolveLocalSrc(src));
  }
  return defaultImage
    ? defaultImage(tokens, idx, options, env, self)
    : self.renderToken(tokens, idx, options);
};

/** Resolve a note-relative image path into a webview-loadable asset URL. */
function resolveLocalSrc(src: string): string {
  if (!editor.path) return src;
  const abs = refToAbsPath(src, editor.path);
  return abs ? displayUrl(abs) : src;
}

const html = computed(() => md.render(editor.content));

/**
 * markdown-it 的 token 改写只覆盖 `![](...)` 语法；markdown 里直接内嵌的
 * HTML `<img src="相对路径">`（如 README 表格截图）会原样输出，webview 按
 * 虚拟域名解析导致破图。渲染后在 DOM 上兜底：仍为本地相对/绝对路径的 img
 * 一律改写为 asset URL（与 HiEditor 预览 resolveLocalImages 同思路）。
 * refToAbsPath 对 http/data/asset 等外部源返回 null，已处理的图片自动跳过。
 */
async function resolveHtmlImages(): Promise<void> {
  await nextTick();
  if (!editor.path || !mdEl.value) return;
  for (const img of mdEl.value.querySelectorAll("img[src]")) {
    const raw = img.getAttribute("src") ?? "";
    if (!raw) continue;
    const abs = refToAbsPath(raw, editor.path);
    if (abs) img.setAttribute("src", displayUrl(abs));
  }
  // 分屏模式：内容变化（打字、切换文档、图片占位替换）后让预览区
  // 重新跟随编辑区顶部可见源码行。
  if (editor.view === "split") syncPreviewFromEditor();
}

watch(html, () => void resolveHtmlImages());
</script>

<template>
  <div class="preview-root">
    <div
      ref="scrollEl"
      class="preview-scroll"
      @dblclick="onDblClick"
      @click="onClick"
      @contextmenu="onContextMenu"
      @scroll="onScroll"
    >
      <div ref="mdEl" class="md-preview" v-html="html"></div>
    </div>
    <PreviewSearch ref="searchRef" :container="scrollEl" />
  </div>
</template>

<style scoped>
.preview-root {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.preview-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 20px 36px 48px;
  background: var(--bg-layer);
}
.md-preview {
  /* 靠左显示：不做水平居中（max-width + margin:auto 已移除），左右边距由 .preview-scroll 提供 */
}
</style>
