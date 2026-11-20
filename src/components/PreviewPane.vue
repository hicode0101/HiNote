<script setup lang="ts">
import { computed } from "vue";
import MarkdownIt from "markdown-it";
import taskListsPlugin from "markdown-it-task-lists";
import hljs from "highlight.js";
import { refToAbsPath, displayUrl } from "@/lib/imgSrc";
import { editor } from "@/stores/editor";
import { openFromContainer } from "@/stores/imgpreview";
import { hlAuto } from "@/lib/hljsAuto";

/** Double-click an image in the preview to open the gallery overlay. */
function onDblClick(e: MouseEvent): void {
  const img = (e.target as Element).closest("img");
  const container = (e.currentTarget as Element).querySelector(".md-preview");
  if (img && container) openFromContainer(container as HTMLElement, img);
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
</script>

<template>
  <div class="preview-scroll" @dblclick="onDblClick">
    <div class="md-preview" v-html="html"></div>
  </div>
</template>

<style scoped>
.preview-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 20px 36px 48px;
  background: var(--bg-layer);
}
.md-preview {
  max-width: 860px;
  margin: 0 auto;
}
</style>
