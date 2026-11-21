<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { renderMarkdown, resolveLocalImagesIn } from "@/lib/markdownRender";
import { refToAbsPath, displayUrl, assetUrlToAbsPath } from "@/lib/imgSrc";
import { api, isImagePath } from "@/lib/tauri";
import { editor, onContentChange } from "@/stores/editor";
import { activateFile } from "@/stores/workspace";
import { openEditorMenu, showToast } from "@/stores/ui";
import { openFromContainer } from "@/stores/imgpreview";
import { t } from "@/lib/i18n";
import Icon from "./Icon.vue";
import PreviewSearch from "./PreviewSearch.vue";

// ===== 所见即所得模式 =====
// 渲染完全复用预览逻辑（markdown-it 全量渲染，保真一致）；交互方式为
// “点击元素 → 选中并进入编辑状态 → 右侧属性面板修改内容/属性 → 写回
// markdown 源码”。源码定位依赖共享渲染库输出的 data-line/data-line-end
// 块级锚点（0 基行号，end 为排他边界）。文档始终是 markdown 源文本。

const EXTERNAL_RE = /^(https?|data|asset|blob|file):/i;

const scrollEl = ref<HTMLElement | null>(null);
const mdEl = ref<HTMLElement | null>(null);
const searchRef = ref<InstanceType<typeof PreviewSearch> | null>(null);
const bodyEl = ref<HTMLTextAreaElement | null>(null);

const html = computed(() => renderMarkdown(editor.content));

// ---------- 选中状态 ----------

interface Selection {
  kind: "image" | "link" | "text";
  /** 1 基闭区间源码行范围 */
  lineFrom: number;
  lineTo: number;
  /** 图片是否为 HTML `<img>` 标签形式 */
  isHtml?: boolean;
  /** 选定时文档中的 src/dest 原文（应用时按它重新定位标签） */
  origDocSrc?: string;
  /** 链接选定时文档中的 href 原文 */
  origHref?: string;
}

const selected = ref<Selection | null>(null);
const fSrc = ref("");
const fAlt = ref("");
const fWidth = ref("");
const fHref = ref("");
const fLinkText = ref("");
const fBody = ref("");

const panelTitle = computed(() => {
  if (!selected.value) return "";
  if (selected.value.kind === "image") return t("wysiwyg.panelImage");
  if (selected.value.kind === "link") return t("wysiwyg.panelLink");
  return t("wysiwyg.panelText");
});

/** 图片字段实时缩略图 */
const thumbSrc = computed(() => resolveSrc(fSrc.value));

function resolveSrc(dest: string): string {
  const d = dest.trim();
  if (!d) return "";
  if (EXTERNAL_RE.test(d)) return d;
  if (!editor.path) return d;
  const abs = refToAbsPath(d, editor.path);
  return abs ? displayUrl(abs) : d;
}

// ---------- 源码行工具 ----------

function docLines(): string[] {
  return editor.content.split(/\r\n|\n/);
}
function docEol(): string {
  return /\r\n/.test(editor.content) ? "\r\n" : "\n";
}
function sourceBlock(from: number, to: number): string[] {
  return docLines().slice(from - 1, to);
}
function replaceDocLines(from: number, to: number, next: string[]): void {
  const lines = docLines();
  lines.splice(from - 1, to - from + 1, ...next);
  onContentChange(lines.join(docEol()));
}

function normAbs(p: string): string {
  return p.replace(/\\/g, "/").toLowerCase();
}

/** 文档中的 src/dest 与预览 DOM 上的 src 是否指向同一目标 */
function docSrcEquals(docSrc: string, domSrc: string): boolean {
  const d = docSrc.trim();
  if (!d) return false;
  const domAbs = assetUrlToAbsPath(domSrc);
  if (domAbs) {
    if (EXTERNAL_RE.test(d) || !editor.path) return false;
    const abs = refToAbsPath(d, editor.path);
    return !!abs && normAbs(abs) === normAbs(domAbs);
  }
  // DOM src 未解析为本地（外部图片）：按字面量比对
  return d.toLowerCase() === domSrc.trim().toLowerCase();
}

function hrefEquals(docHref: string, domHref: string): boolean {
  const dec = (v: string) => {
    try {
      return decodeURIComponent(v.trim());
    } catch {
      return v.trim();
    }
  };
  return dec(docHref) === dec(domHref) || docHref.trim() === domHref.trim();
}

interface TagHit {
  idx: number; // 起始行（block 内 0 基）
  start: number; // 起始行内偏移
  endIdx: number; // 结束行
  end: number; // 结束行内偏移
  text: string;
  html: boolean;
  docSrc?: string;
  mdAlt?: string;
  docText?: string;
}

/** 把整块拼接后的偏移换算回（行索引, 行内偏移） */
function offsetToPos(block: string[], offset: number): { idx: number; col: number } {
  let acc = 0;
  for (let i = 0; i < block.length; i++) {
    const len = block[i].length + 1; // join 时补的换行
    if (offset < acc + len) return { idx: i, col: offset - acc };
    acc += len;
  }
  const last = block.length - 1;
  return { idx: last, col: block[last]?.length ?? 0 };
}

/** 在整块内搜索标签（支持跨行的 HTML 标签），test 决定哪个命中有效 */
function searchBlock(
  block: string[],
  source: string,
  flags: string,
  test: (text: string) => boolean
): { idx: number; start: number; endIdx: number; end: number; text: string } | null {
  const joined = block.join("\n");
  const g = new RegExp(source, flags.includes("g") ? flags : flags + "g");
  let m: RegExpExecArray | null;
  while ((m = g.exec(joined))) {
    if (!test(m[0])) continue;
    const startP = offsetToPos(block, m.index);
    const endP = offsetToPos(block, m.index + m[0].length);
    return { idx: startP.idx, start: startP.col, endIdx: endP.idx, end: endP.col, text: m[0] };
  }
  return null;
}

/** 用新标签替换命中范围（单行或多行均可） */
function replaceTagInBlock(
  block: string[],
  hit: { idx: number; start: number; endIdx: number; end: number },
  newTag: string
): void {
  const prefix = block[hit.idx].slice(0, hit.start);
  const suffix = block[hit.endIdx].slice(hit.end);
  block.splice(hit.idx, hit.endIdx - hit.idx + 1, prefix + newTag + suffix);
}

const IMG_TAG_SRC = "\\bsrc=(?:\"([^\"]*)\"|'([^']*)'|([^\\s\"'>]+))";
const MD_IMAGE_TAG = "!\\[[^\\]]*\\]\\(\\s*(?:<[^>]*>|[^)\\s]+)(?:\\s+\"[^\"]*\")?\\s*\\)";

function findImageTag(block: string[], domSrc: string): TagHit | null {
  const htmlHit = searchBlock(block, `<img\\b[^>]*>`, "gi", (text) => {
    const sm = new RegExp(IMG_TAG_SRC, "i").exec(text);
    return !!sm && docSrcEquals(sm[1] ?? sm[2] ?? sm[3] ?? "", domSrc);
  });
  if (htmlHit) {
    const sm = new RegExp(IMG_TAG_SRC, "i").exec(htmlHit.text)!;
    return { ...htmlHit, html: true, docSrc: sm[1] ?? sm[2] ?? sm[3] ?? "" };
  }
  const mdHit = searchBlock(block, MD_IMAGE_TAG, "g", (text) => {
    const dm = /^!\[([^\]]*)\]\(\s*(?:<([^>]*)>|([^)\s]+))/.exec(text);
    return !!dm && docSrcEquals((dm[2] ?? dm[3] ?? "").trim(), domSrc);
  });
  if (mdHit) {
    const dm = /^!\[([^\]]*)\]\(\s*(?:<([^>]*)>|([^)\s]+))/.exec(mdHit.text)!;
    return { ...mdHit, html: false, docSrc: (dm[2] ?? dm[3] ?? "").trim(), mdAlt: dm[1] };
  }
  return null;
}

function findImageTagBySrc(block: string[], origDocSrc: string): TagHit | null {
  const target = origDocSrc.trim().toLowerCase();
  const htmlHit = searchBlock(block, `<img\\b[^>]*>`, "gi", (text) => {
    const sm = new RegExp(IMG_TAG_SRC, "i").exec(text);
    return !!sm && (sm[1] ?? sm[2] ?? sm[3] ?? "").trim().toLowerCase() === target;
  });
  if (htmlHit) {
    const sm = new RegExp(IMG_TAG_SRC, "i").exec(htmlHit.text)!;
    return { ...htmlHit, html: true, docSrc: sm[1] ?? sm[2] ?? sm[3] ?? "" };
  }
  const mdHit = searchBlock(block, MD_IMAGE_TAG, "g", (text) => {
    const dm = /^!\[([^\]]*)\]\(\s*(?:<([^>]*)>|([^)\s]+))/.exec(text);
    return !!dm && (dm[2] ?? dm[3] ?? "").trim().toLowerCase() === target;
  });
  if (mdHit) {
    const dm = /^!\[([^\]]*)\]\(\s*(?:<([^>]*)>|([^)\s]+))/.exec(mdHit.text)!;
    return { ...mdHit, html: false, docSrc: dm[2] ?? dm[3] ?? "", mdAlt: dm[1] };
  }
  return null;
}

function findLinkTag(block: string[], domHref: string): TagHit | null {
  const htmlHit = searchBlock(block, `<a\\b[^>]*>[\\s\\S]*?</a>`, "gi", (text) => {
    const hm = new RegExp(IMG_TAG_SRC.replace("src", "href"), "i").exec(text);
    return !!hm && hrefEquals(hm[1] ?? hm[2] ?? hm[3] ?? "", domHref);
  });
  if (htmlHit) {
    const hm = new RegExp(IMG_TAG_SRC.replace("src", "href"), "i").exec(htmlHit.text)!;
    return { ...htmlHit, html: true, docSrc: hm[1] ?? hm[2] ?? hm[3] ?? "" };
  }
  const mdHit = searchBlock(block, "\\[[^\\]]*\\]\\([^)]*\\)", "g", (text) => {
    const dm = /\[[^\]]*\]\(\s*(?:<([^>]*)>|([^)\s]+))/.exec(text);
    return !!dm && hrefEquals(dm[1] ?? dm[2] ?? "", domHref);
  });
  if (mdHit) {
    const dm = /\[[^\]]*\]\(\s*(?:<([^>]*)>|([^)\s]+))/.exec(mdHit.text)!;
    return {
      ...mdHit,
      html: false,
      docSrc: (dm[1] ?? dm[2] ?? "").trim(),
      docText: /^\[([^\]]*)\]/.exec(mdHit.text)?.[1] ?? "",
    };
  }
  return null;
}

function setHtmlAttr(tag: string, name: string, value: string): string {
  const esc = value.replace(/"/g, "&quot;");
  const re = new RegExp(`\\b${name}=(?:"[^"]*"|'[^']*'|[^\\s"'>]+)`, "i");
  if (re.test(tag)) return tag.replace(re, `${name}="${esc}"`);
  return tag.replace(/^<img/i, `<img ${name}="${esc}"`);
}
function removeHtmlAttr(tag: string, name: string): string {
  const re = new RegExp(`\\s*\\b${name}=(?:"[^"]*"|'[^']*'|[^\\s"'>]+)`, "i");
  return tag.replace(re, "");
}

// ---------- 点击选择 ----------

function onSurfaceClick(e: MouseEvent): void {
  if (!(e.target instanceof Element)) return;
  const block = e.target.closest("[data-line]");
  if (!block) {
    selected.value = null;
    return;
  }
  const lineFrom = Number(block.getAttribute("data-line")) + 1;
  const lineTo = Number(block.getAttribute("data-line-end") ?? block.getAttribute("data-line")) + 1;

  // 任务复选框：点击直接改写源码 [ ] ⇄ [x]
  if (e.target.closest('input[type="checkbox"]')) {
    toggleTask(lineFrom, lineTo);
    return;
  }
  const img = e.target.closest("img");
  if (img) {
    selectImage(img, lineFrom, lineTo);
    return;
  }
  const a = e.target.closest("a");
  if (a) {
    selectLink(a, lineFrom, lineTo);
    return;
  }
  selected.value = { kind: "text", lineFrom, lineTo };
  fBody.value = sourceBlock(lineFrom, lineTo).join("\n");
  void nextTick(highlightSelected);
}

function selectImage(img: Element, lineFrom: number, lineTo: number): void {
  const domSrc = img.getAttribute("src") ?? "";
  const found = findImageTag(sourceBlock(lineFrom, lineTo), domSrc);
  if (!found) {
    selected.value = null;
    return;
  }
  const attrs = found.html ? parseImgAttrs(found.text) : null;
  selected.value = {
    kind: "image",
    lineFrom,
    lineTo,
    isHtml: found.html,
    origDocSrc: found.docSrc,
  };
  fSrc.value = found.docSrc ?? "";
  fAlt.value = found.html ? (attrs?.alt ?? "") : (found.mdAlt ?? "");
  fWidth.value = attrs?.width ?? "";
  void nextTick(highlightSelected);
}

function selectLink(a: Element, lineFrom: number, lineTo: number): void {
  const domHref = a.getAttribute("href") ?? "";
  const found = findLinkTag(sourceBlock(lineFrom, lineTo), domHref);
  if (!found) {
    selected.value = null;
    return;
  }
  selected.value = {
    kind: "link",
    lineFrom,
    lineTo,
    isHtml: found.html,
    origHref: found.docSrc ?? "",
  };
  fHref.value = found.docSrc ?? "";
  fLinkText.value = found.html ? "" : (found.docText ?? "");
  void nextTick(highlightSelected);
}

function parseImgAttrs(tag: string): { alt?: string; width?: string } {
  const get = (name: string): string | undefined => {
    const m = new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i").exec(tag);
    return m ? (m[1] ?? m[2] ?? m[3] ?? "").trim() : undefined;
  };
  return { alt: get("alt"), width: get("width") };
}

function toggleTask(lineFrom: number, lineTo: number): void {
  const lines = docLines();
  for (let i = lineFrom - 1; i <= lineTo - 1 && i < lines.length; i++) {
    const m = /\[[ xX]\]/.exec(lines[i]);
    if (m) {
      const next = m[0] === "[ ]" ? "[x]" : "[ ]";
      lines[i] = lines[i].slice(0, m.index) + next + lines[i].slice(m.index + 3);
      onContentChange(lines.join(docEol()));
      return;
    }
  }
}

// ---------- 面板应用 ----------

function applyImage(): void {
  const s = selected.value;
  if (!s || s.kind !== "image") return;
  const block = sourceBlock(s.lineFrom, s.lineTo);
  const found = findImageTagBySrc(block, s.origDocSrc ?? "");
  if (!found) {
    showToast(t("wysiwyg.tagGone"));
    return;
  }
  let newTag: string;
  if (found.html) {
    newTag = setHtmlAttr(found.text, "src", fSrc.value.trim());
    newTag = fAlt.value.trim() ? setHtmlAttr(newTag, "alt", fAlt.value.trim()) : removeHtmlAttr(newTag, "alt");
    newTag = fWidth.value.trim() ? setHtmlAttr(newTag, "width", fWidth.value.trim()) : removeHtmlAttr(newTag, "width");
  } else {
    newTag = `![${fAlt.value}](${fSrc.value.trim()})`;
  }
  replaceTagInBlock(block, found, newTag);
  replaceDocLines(s.lineFrom, s.lineTo, block);
}

function applyLink(): void {
  const s = selected.value;
  if (!s || s.kind !== "link") return;
  const block = sourceBlock(s.lineFrom, s.lineTo);
  const found = findLinkTag(block, s.origHref ?? "");
  if (!found) {
    showToast(t("wysiwyg.tagGone"));
    return;
  }
  let newTag: string;
  if (found.html) {
    newTag = setHtmlAttr(found.text, "href", fHref.value.trim());
  } else {
    newTag = `[${fLinkText.value}](${fHref.value.trim()})`;
  }
  replaceTagInBlock(block, found, newTag);
  replaceDocLines(s.lineFrom, s.lineTo, block);
}

function applyText(): void {
  const s = selected.value;
  if (!s || s.kind !== "text") return;
  replaceDocLines(s.lineFrom, s.lineTo, fBody.value.split("\n"));
}

/** 链接面板：打开链接（网页进浏览器，工作区文件跳转） */
function openLink(): void {
  const href = fHref.value.trim();
  if (!href) return;
  if (/^(https?|mailto):/i.test(href)) {
    void api.openUrl(href).catch(() => {});
    return;
  }
  if (!editor.path) return;
  const abs = refToAbsPath(href, editor.path);
  if (abs) void activateFile(abs);
}

// ---------- 文本块面板：对 textarea 选区应用行内格式 ----------

function wrapBodySel(before: string, after: string): void {
  const el = bodyEl.value;
  if (!el || el.selectionStart === el.selectionEnd) return;
  const s = el.selectionStart;
  const e = el.selectionEnd;
  const v = fBody.value;
  fBody.value = v.slice(0, s) + before + v.slice(s, e) + after + v.slice(e);
  void nextTick(() => {
    el.focus();
    el.setSelectionRange(s + before.length, e + before.length);
  });
}

function setBodyHeading(n: number): void {
  const el = bodyEl.value;
  if (!el) return;
  const v = fBody.value;
  const lineStart = v.lastIndexOf("\n", Math.max(0, el.selectionStart - 1)) + 1;
  const nl = v.indexOf("\n", lineStart);
  const lineEnd = nl === -1 ? v.length : nl;
  const stripped = v.slice(lineStart, lineEnd).replace(/^#{1,6}[ \t]+/, "");
  const next = "#".repeat(n) + " " + stripped;
  fBody.value = v.slice(0, lineStart) + next + v.slice(lineEnd);
  void nextTick(() => {
    el.focus();
    el.setSelectionRange(lineStart + next.length, lineStart + next.length);
  });
}

// ---------- 渲染后处理 / 高亮 ----------

function highlightSelected(): void {
  mdEl.value?.querySelectorAll(".md-wys-selected").forEach((el) => el.classList.remove("md-wys-selected"));
  const s = selected.value;
  if (!s || !mdEl.value) return;
  const block = mdEl.value.querySelector(`[data-line="${s.lineFrom - 1}"]`);
  if (!block) {
    selected.value = null; // 元素已随内容变化消失
    return;
  }
  let el: Element = block;
  if (s.kind === "image") el = block.querySelector("img") ?? block;
  else if (s.kind === "link") el = block.querySelector("a") ?? block;
  el.classList.add("md-wys-selected");
}

// ---------- 交互（与预览一致的画廊 / 右键菜单 / Ctrl+F） ----------

function onDblClick(e: MouseEvent): void {
  const img = (e.target as Element).closest("img");
  const container = (e.currentTarget as Element).querySelector(".md-preview");
  if (img && container) openFromContainer(container as HTMLElement, img);
}

function onContextMenu(e: MouseEvent): void {
  e.preventDefault();
  const img = (e.target as Element).closest("img");
  const rawSrc = img?.getAttribute("src") ?? "";
  const abs = rawSrc ? assetUrlToAbsPath(rawSrc) : null;
  openEditorMenu(e.clientX, e.clientY, {
    clipboardOnly: true,
    canPaste: false,
    onImage: !!img,
    imageFile: abs && isImagePath(abs) ? abs : null,
    imageSrc: rawSrc || null,
  });
}

function onDocKey(e: KeyboardEvent): void {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
    e.preventDefault();
    e.stopPropagation();
    void searchRef.value?.open();
  }
}

watch(html, () => {
  void nextTick().then(() => {
    resolveLocalImagesIn(mdEl.value);
    highlightSelected();
  });
});
watch(
  () => editor.path,
  () => {
    selected.value = null;
  }
);
onMounted(() => {
  document.addEventListener("keydown", onDocKey, true);
  void nextTick().then(() => resolveLocalImagesIn(mdEl.value));
});
onUnmounted(() => document.removeEventListener("keydown", onDocKey, true));
</script>

<template>
  <div class="wysiwyg-root">
    <div class="wysiwyg-main">
      <div
        ref="scrollEl"
        class="preview-scroll"
        @click="onSurfaceClick"
        @dblclick="onDblClick"
        @contextmenu="onContextMenu"
      >
        <div ref="mdEl" class="md-preview" v-html="html"></div>
      </div>
      <PreviewSearch ref="searchRef" :container="scrollEl" />
    </div>

    <aside v-if="selected" class="wysiwyg-panel">
      <div class="panel-head">
        <span class="panel-title">{{ panelTitle }}</span>
        <button class="panel-close" :title="t('editor.closeFile')" @click="selected = null">
          <Icon name="dismiss" :size="14" />
        </button>
      </div>

      <!-- 图片：src / alt / width（HTML 形式）+ 实时缩略图 -->
      <template v-if="selected.kind === 'image'">
        <label>{{ t("wysiwyg.src") }}<input v-model="fSrc" /></label>
        <label>{{ t("wysiwyg.alt") }}<input v-model="fAlt" /></label>
        <label v-if="selected.isHtml">{{ t("wysiwyg.width") }}<input v-model="fWidth" /></label>
        <img v-if="thumbSrc" class="panel-thumb" :src="thumbSrc" />
        <button class="panel-apply" @click="applyImage">{{ t("wysiwyg.apply") }}</button>
      </template>

      <!-- 链接：文字 / href -->
      <template v-else-if="selected.kind === 'link'">
        <label v-if="!selected.isHtml">{{ t("wysiwyg.linkText") }}<input v-model="fLinkText" /></label>
        <label>{{ t("wysiwyg.href") }}<input v-model="fHref" /></label>
        <button class="panel-apply secondary" @click="openLink">{{ t("wysiwyg.openLink") }}</button>
        <button class="panel-apply" @click="applyLink">{{ t("wysiwyg.apply") }}</button>
      </template>

      <!-- 文本块：原始 markdown 源码 + 行内格式辅助 -->
      <template v-else>
        <div class="panel-fmt">
          <button :title="t('toolbar.bold')" @click="wrapBodySel('**', '**')"><Icon name="bold" :size="14" /></button>
          <button :title="t('toolbar.italic')" @click="wrapBodySel('*', '*')"><Icon name="italic" :size="14" /></button>
          <button :title="t('toolbar.strike')" @click="wrapBodySel('~~', '~~')"><Icon name="strike" :size="14" /></button>
          <button :title="t('toolbar.code')" @click="wrapBodySel('`', '`')"><Icon name="code" :size="14" /></button>
          <button class="tool-text" title="H1" @click="setBodyHeading(1)">H1</button>
          <button class="tool-text" title="H2" @click="setBodyHeading(2)">H2</button>
          <button class="tool-text" title="H3" @click="setBodyHeading(3)">H3</button>
        </div>
        <label>{{ t("wysiwyg.body") }}<textarea ref="bodyEl" v-model="fBody" rows="10" spellcheck="false"></textarea></label>
        <button class="panel-apply" @click="applyText">{{ t("wysiwyg.apply") }}</button>
      </template>
    </aside>
  </div>
</template>

<style scoped>
.wysiwyg-root {
  flex: 1;
  min-height: 0;
  display: flex;
}
.wysiwyg-main {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

/* ---------- 右侧属性面板 ---------- */
.wysiwyg-panel {
  flex: 0 0 300px;
  border-left: 1px solid var(--stroke);
  background: var(--bg-card);
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.panel-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}
.panel-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
}
.panel-close:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.wysiwyg-panel label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}
.wysiwyg-panel input,
.wysiwyg-panel textarea {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--stroke);
  border-radius: var(--radius-sm);
  background: var(--bg-layer);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 12.5px;
  outline: none;
  resize: vertical;
}
.wysiwyg-panel textarea {
  font-family: var(--mono-font, ui-monospace, Consolas, monospace);
  line-height: 1.5;
}
.wysiwyg-panel input:focus,
.wysiwyg-panel textarea:focus {
  border-color: var(--accent);
}

.panel-thumb {
  max-width: 100%;
  max-height: 160px;
  object-fit: contain;
  border: 1px solid var(--stroke);
  border-radius: 6px;
  background: var(--bg-subtle);
}

.panel-apply {
  align-self: flex-start;
  padding: 6px 16px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: var(--accent-text);
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}
.panel-apply:hover {
  filter: brightness(1.08);
}
.panel-apply.secondary {
  background: var(--bg-subtle);
  color: var(--text-primary);
  border: 1px solid var(--stroke);
}

.panel-fmt {
  display: flex;
  align-items: center;
  gap: 2px;
}
.panel-fmt button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 26px;
  height: 26px;
  padding: 0 6px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}
.panel-fmt button:hover {
  background: var(--bg-hover);
  color: var(--accent);
}
.panel-fmt .tool-text {
  font-size: 11px;
  font-weight: 700;
}
</style>
