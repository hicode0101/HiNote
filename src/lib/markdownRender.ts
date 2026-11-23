import MarkdownIt from "markdown-it";
import taskListsPlugin from "markdown-it-task-lists";
import hljs from "highlight.js";
import { refToAbsPath, displayUrl } from "@/lib/imgSrc";
import { editor } from "@/stores/editor";
import { hlAuto } from "@/lib/hljsAuto";

// ===== 共享 markdown 渲染（预览 / 所见即所得 surface 共用）=====
// 保证两种视图的渲染结果完全一致：语法高亮、任务列表、图片本地解析、
// 以及供“源码行映射”使用的 data-line / data-line-end 块级锚点。

/** Schemes the webview can load as-is. */
const EXTERNAL_RE = /^(https?|data|asset|blob):/i;

/**
 * highlight.js 的 `shell`（别名 console / shellsession）是"终端会话记录"
 * 语法，只识别 `$` 提示符行，对普通脚本内容零标记（用户直觉的 shell 脚本
 * 对应 bash）。按 GitHub / VS Code 惯例映射到 bash。
 */
const SHELL_SESSION_LANGS = new Set(["shell", "console", "shellsession"]);

/** Resolve a note-relative image path into a webview-loadable asset URL. */
function resolveLocalSrc(src: string): string {
  if (!editor.path) return src;
  const abs = refToAbsPath(src, editor.path);
  return abs ? displayUrl(abs) : src;
}

export const md: MarkdownIt = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: false,
  highlight(str: string, lang: string): string {
    if (SHELL_SESSION_LANGS.has(lang)) lang = "bash";
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

// 块级元素标注源码行范围（0 基，含起点不含终点）：滚动同步与
// 所见即所得“点击元素 → 定位源码行”都依赖它。
md.core.ruler.push("hinote_data_line", (state) => {
  for (const token of state.tokens) {
    if (token.map && token.nesting !== -1) {
      token.attrSet("data-line", String(token.map[0]));
      token.attrSet("data-line-end", String(token.map[1]));
    }
  }
});

// 默认 fence 渲染器遇到以 <pre 开头的 highlight 结果（hljs 路径全部如此）
// 会原样返回、丢弃 token 属性。补一个规则把行号锚点放回 <pre> 上。
const defaultFence = md.renderer.rules.fence;
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const html = defaultFence
    ? defaultFence(tokens, idx, options, env, self)
    : self.renderToken(tokens, idx, options);
  const map = tokens[idx].map;
  if (!map) return html;
  return html.replace(
    "<pre",
    `<pre data-line="${map[0]}" data-line-end="${map[1]}"`
  );
};

// html_block 的内容原样输出（属性同样丢失）。包一层带行号锚点的容器，
// 让块级 HTML（<br/>、<a>、<img> 等）也能被所见即所得模式点击定位。
const defaultHtmlBlock = md.renderer.rules.html_block;
md.renderer.rules.html_block = (tokens, idx, options, env, self) => {
  const html = defaultHtmlBlock
    ? defaultHtmlBlock(tokens, idx, options, env, self)
    : self.renderToken(tokens, idx, options);
  const map = tokens[idx].map;
  if (!map) return html;
  return `<div class="md-htmlblock" data-line="${map[0]}" data-line-end="${map[1]}">${html}</div>`;
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
  if (src && !EXTERNAL_RE.test(src)) {
    token.attrSet("src", resolveLocalSrc(src));
  }
  return defaultImage
    ? defaultImage(tokens, idx, options, env, self)
    : self.renderToken(tokens, idx, options);
};

/** Render markdown source to HTML（预览 / 所见即所得共用入口）。 */
export function renderMarkdown(src: string): string {
  return md.render(src);
}

/**
 * 渲染后在 DOM 上兜底：markdown 里直接内嵌的 HTML `<img src="相对路径">`
 * 会原样输出，webview 按虚拟域名解析导致破图；仍为本地相对/绝对路径的
 * img 一律改写为 asset URL（与 HiEditor 预览 resolveLocalImages 同思路）。
 * refToAbsPath 对 http/data/asset 等外部源返回 null，已处理的图片自动跳过。
 */
export function resolveLocalImagesIn(root: HTMLElement | null): void {
  if (!editor.path || !root) return;
  for (const img of root.querySelectorAll("img[src]")) {
    const raw = img.getAttribute("src") ?? "";
    if (!raw) continue;
    const abs = refToAbsPath(raw, editor.path);
    if (abs) img.setAttribute("src", displayUrl(abs));
  }
}
