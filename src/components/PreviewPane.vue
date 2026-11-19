<script setup lang="ts">
import { computed } from "vue";
import MarkdownIt from "markdown-it";
import taskListsPlugin from "markdown-it-task-lists";
import hljs from "highlight.js";
import { refToAbsPath, displayUrl } from "@/lib/imgSrc";
import { editor } from "@/stores/editor";

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
    return `<pre class="hljs"><code>${md.utils.escapeHtml(str)}</code></pre>`;
  },
});
md.use(taskListsPlugin, { enabled: true });

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
  <div class="preview-scroll">
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
