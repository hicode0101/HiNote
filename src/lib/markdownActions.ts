import type { EditorView } from "@codemirror/view";
import { undo, redo } from "@codemirror/commands";
import { t } from "./i18n";
import { api, baseName, isImagePath } from "./tauri";
import { refToAbsPath } from "./imgSrc";
import { settings } from "@/stores/settings";
import { confirmDialog } from "@/stores/dialog";
import { showToast } from "@/stores/ui";
import { editor, onContentChange } from "@/stores/editor";

let view: EditorView | null = null;

/** Register/unregister the live CodeMirror view. */
export function registerEditorView(v: EditorView | null): void {
  view = v;
}

/** Current CodeMirror view; used by the search overlay and format actions. */
export function getEditorView(): EditorView | null {
  return view;
}

function requireView(): EditorView {
  if (!view) throw new Error("editor not ready");
  return view;
}

function focusAndSync(): void {
  if (!view) return;
  view.focus();
  syncFromView();
}

function syncFromView(): void {
  if (!view) return;
  editor.content = view.state.doc.toString();
  editor.dirty = editor.content !== editor.savedContent;
}

/** Wrap the selection (or a placeholder) with the given markers. */
export function wrapSelection(
  before: string,
  after: string = before,
  placeholder = ""
): void {
  const v = requireView();
  const sel = v.state.selection.main;
  const selected = v.state.sliceDoc(sel.from, sel.to);
  const inner = selected || placeholder;
  v.dispatch({
    changes: {
      from: sel.from,
      to: sel.to,
      insert: before + inner + after,
    },
    selection: {
      anchor: sel.from + before.length,
      head: sel.from + before.length + inner.length,
    },
    scrollIntoView: true,
  });
  focusAndSync();
}

function replaceLines(prefixFor: (i: number, count: number) => string): void {
  const v = requireView();
  const sel = v.state.selection.main;
  const fromLine = v.state.doc.lineAt(sel.from);
  const toLine = v.state.doc.lineAt(sel.to);
  const lines: { from: number; to: number; insert: string }[] = [];
  let cursor: { anchor: number } | undefined;
  for (let i = 0, n = fromLine.number; n <= toLine.number; n++, i++) {
    const line = v.state.doc.line(n);
    // Strip an existing heading/quote/list prefix before applying the new one.
    const stripped = line.text.replace(/^\s*(#{1,6}\s|>\s|[-*+]\s\[[ x]\]\s|[-*+]\s|\d+\.\s)/, "");
    const insert = prefixFor(i, toLine.number - fromLine.number + 1) + stripped;
    lines.push({ from: line.from, to: line.to, insert });
    if (i === 0) cursor = { anchor: line.from + insert.length };
  }
  v.dispatch({ changes: lines, selection: cursor, scrollIntoView: true });
  focusAndSync();
}

export function setHeading(level: number): void {
  replaceLines(() => "#".repeat(level) + " ");
}

export function toggleQuote(): void {
  replaceLines(() => "> ");
}

export function bulletList(): void {
  replaceLines(() => "- ");
}

export function numberedList(): void {
  replaceLines((i) => `${i + 1}. `);
}

export function taskList(): void {
  replaceLines(() => "- [ ] ");
}

export function insertBlock(text: string): void {
  const v = requireView();
  const sel = v.state.selection.main;
  const line = v.state.doc.lineAt(sel.to);
  const prefix = line.text.trim() === "" ? "" : "\n";
  v.dispatch({
    changes: {
      from: sel.to,
      to: sel.to,
      insert: prefix + text,
    },
    selection: { anchor: sel.to + prefix.length + text.length },
    scrollIntoView: true,
  });
  focusAndSync();
}

export function insertCodeBlock(): void {
  const v = requireView();
  const sel = v.state.selection.main;
  if (sel.from === sel.to) {
    insertBlock("```\n\n```\n");
    // Move cursor inside the fence.
    if (view) {
      const pos = view.state.selection.main.anchor;
      view.dispatch({ selection: { anchor: pos - 5 } });
      view.focus();
      syncFromView();
    }
    return;
  }
  // 有选中内容：扩展到整行，用围栏包住选中行（``` 必须位于行首才是围栏，
  // 精确贴着选区两端会把行内文本撕开）。选区止于某行行首时视为只选到上一行。
  const firstLine = v.state.doc.lineAt(sel.from);
  const atLineStart = v.state.doc.lineAt(sel.to).from === sel.to;
  const lastLine = atLineStart ? v.state.doc.lineAt(sel.to - 1) : v.state.doc.lineAt(sel.to);
  const head = "```\n";
  const tail = "\n```";
  v.dispatch({
    changes: [
      { from: firstLine.from, to: firstLine.from, insert: head },
      { from: lastLine.to, to: lastLine.to, insert: tail },
    ],
    selection: { anchor: firstLine.from + head.length + (lastLine.to - firstLine.from) },
    scrollIntoView: true,
  });
  focusAndSync();
}

export function insertTable(): void {
  const col = t("toolbar.tableCol");
  const text = `| ${col}1 | ${col}2 | ${col}3 |\n| --- | --- | --- |\n|  |  |  |\n`;
  insertBlock(text);
}

export function insertHorizontalRule(): void {
  insertBlock("\n---\n");
}

/** 在光标处插入 <br/> 换行标签（Markdown 渲染为强制换行）。 */
export function insertBr(): void {
  insertAtCursor("<br/>");
}

export function insertLink(): void {
  wrapSelection("[", "](https://)", "https://");
}

export function doUndo(): void {
  if (!view) return;
  undo(view);
  focusAndSync();
}

export function doRedo(): void {
  if (!view) return;
  redo(view);
  focusAndSync();
}

// ===== Editor context-menu actions (clipboard + selection) =====

/** True when the editor has a non-empty selection. */
export function hasSelection(): boolean {
  if (!view) return false;
  const sel = view.state.selection.main;
  return sel.from !== sel.to;
}

function selectedText(): string {
  if (!view) return "";
  const sel = view.state.selection.main;
  return view.state.sliceDoc(sel.from, sel.to);
}

export function deleteSelection(): void {
  if (!view) return;
  const sel = view.state.selection.main;
  if (sel.from === sel.to) return;
  view.dispatch({
    changes: { from: sel.from, to: sel.to },
    selection: { anchor: sel.from },
  });
  focusAndSync();
}

// ===== Deleting a workspace image offers to remove the physical file =====
// Classic (CodeMirror) edition: the trigger is strict — the selection must be
// exactly one complete image tag (markdown `![](...)` or embedded HTML
// `<img src="…">`) whose target resolves inside the workspace. Partial
// selections / plain text deletions never prompt.

/** Complete inline image tag: `![alt](path)`, `![alt](<path>)`, optional title. */
const MD_IMAGE_FULL_RE = /^!\[([^\]]*)\]\(\s*(?:<([^>]*)>|([^\s)]+))(?:\s+"[^"]*")?\s*\)$/;

/** Complete embedded HTML image tag: `<img src="…" …>`, attributes in any order. */
const IMG_TAG_FULL_RE = /^<img\b[^>]*?\bsrc=(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))[^>]*\/?>$/i;

/**
 * When the current selection is exactly one complete image tag (markdown or
 * HTML `<img>`) whose target is a workspace-local image file, return that
 * absolute path.
 */
export function selectionImageFile(): string | null {
  if (!view || !editor.path) return null;
  const sel = view.state.selection.main;
  if (sel.from === sel.to) return null;
  const text = view.state.sliceDoc(sel.from, sel.to).trim();
  const md = MD_IMAGE_FULL_RE.exec(text);
  let dest: string;
  if (md) {
    dest = (md[2] ?? md[3] ?? "").trim();
  } else {
    const img = IMG_TAG_FULL_RE.exec(text);
    if (!img) return null;
    dest = (img[1] ?? img[2] ?? img[3] ?? "").trim();
  }
  if (!dest || /^(https?|data|asset|blob|file):/i.test(dest)) return null;
  const abs = refToAbsPath(dest, editor.path);
  if (!abs || !isImagePath(abs)) return null;
  const ws = settings.workspace?.replace(/[\\/]+$/, "").toLowerCase();
  if (!ws) return null;
  const lower = abs.toLowerCase();
  if (lower !== ws && !lower.startsWith(ws + "\\") && !lower.startsWith(ws + "/")) return null;
  return abs;
}

/**
 * Delete the selection; when it is exactly one workspace image tag, also ask
 * whether to remove the physical file (the tag is removed first — cancel
 * keeps the file on disk).
 */
export async function deleteSelectionCheckingImage(): Promise<void> {
  const v = view;
  if (!v) return;
  const sel = v.state.selection.main;
  if (sel.from === sel.to) return;
  const abs = selectionImageFile();
  v.dispatch({
    changes: { from: sel.from, to: sel.to },
    selection: { anchor: sel.from },
  });
  focusAndSync();
  if (!abs) return;
  const ok = await confirmDialog({
    title: t("dialog.deleteImageTitle"),
    message: t("dialog.deleteImageBody", { names: baseName(abs) }),
    danger: true,
  });
  if (!ok) return;
  try {
    await api.deletePath(abs);
  } catch {
    showToast(t("dialog.deleteImageFailed"));
  }
}

// ===== 预览右键菜单：删除图片 =====

/** Markdown 图片引用（用于在文档源码中定位 `![](...)`）。 */
const MD_IMAGE_REF_RE = /(!\[[^\]]*\]\()(\s*)(<[^>]*>|[^)\n]+?)(\s*\))/g;
/** 内嵌 HTML `<img src="…">`（引号风格各异）。 */
const IMG_SRC_RE = /(<img\b[^>]*?\bsrc=)(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))([^>]*>)/gi;

/**
 * 从文档源码移除所有被 `match` 命中的图片引用（`![](...)` 与 HTML `<img>`）。
 * 整行只承载图片时连行删除，避免留下空行。返回 null 表示没有命中。
 */
function stripImageRefs(
  content: string,
  match: (src: string) => boolean
): string | null {
  const eol = /\r\n/.test(content) ? "\r\n" : "\n";
  const lines = content.split(/\r\n|\n/);
  const out: string[] = [];
  let count = 0;
  for (const line of lines) {
    let local = 0;
    let next = line.replace(MD_IMAGE_REF_RE, (whole: string, _lead: string, _ws: string, dest: string) => {
      let inner = dest.trim();
      if (inner.startsWith("<") && inner.endsWith(">")) inner = inner.slice(1, -1);
      if (inner && match(inner)) {
        local++;
        return "";
      }
      return whole;
    });
    next = next.replace(IMG_SRC_RE, (
      whole: string,
      _lead: string,
      dq: string | undefined,
      sq: string | undefined,
      uq: string | undefined,
      tail: string | undefined
    ) => {
      const src = (dq ?? sq ?? uq ?? "").trim();
      if (src && tail !== undefined && match(src)) {
        local++;
        return "";
      }
      return whole;
    });
    count += local;
    if (local > 0 && next.trim() === "") {
      // 整行只有图片：删除整行，并顺带去掉紧邻的前一个空行，避免留下连续空行
      if (out.length && out[out.length - 1].trim() === "") out.pop();
      continue;
    }
    out.push(next);
  }
  return count > 0 ? out.join(eol) : null;
}

/** 按解析后的绝对路径匹配（覆盖相对/绝对/URL 编码等不同书写形式，斜向归一）。 */
function matchByAbs(abs: string): (src: string) => boolean {
  const target = abs.replace(/\\/g, "/").toLowerCase();
  return (src: string): boolean => {
    if (!editor.path) return false;
    const a = refToAbsPath(src.trim(), editor.path);
    return !!a && a.replace(/\\/g, "/").toLowerCase() === target;
  };
}

/** 按字面量匹配（外部 http/data 图片的 src 原样出现在文档里）。 */
function matchByLiteral(raw: string): (src: string) => boolean {
  const target = raw.trim();
  return (src: string): boolean => src.trim() === target;
}

/**
 * 预览右键“删除图片”：先从文档源码移除图片引用（预览与后台编辑器即时
 * 同步）；图片位于工作区内时，追加确认是否删除物理文件（取消则文件保留）。
 * `abs` 为本地图片绝对路径；外部图片传 null，按 `rawSrc` 字面量匹配。
 */
export async function deletePreviewImage(rawSrc: string, abs: string | null): Promise<void> {
  if (!editor.path) return;
  const src = rawSrc.trim();
  if (!src) return;
  const next = stripImageRefs(editor.content, abs ? matchByAbs(abs) : matchByLiteral(src));
  if (next === null) return;
  onContentChange(next);

  if (!abs || !isImagePath(abs)) return; // 外部/非本地图片：只移除引用
  const ws = settings.workspace?.replace(/[\\/]+$/, "").toLowerCase();
  const lower = abs.toLowerCase();
  if (!ws || (lower !== ws && !lower.startsWith(ws + "\\") && !lower.startsWith(ws + "/"))) return;
  const ok = await confirmDialog({
    title: t("dialog.deleteImageTitle"),
    message: t("dialog.deleteImageBody", { names: baseName(abs) }),
    danger: true,
  });
  if (!ok) return;
  try {
    await api.deletePath(abs);
  } catch {
    showToast(t("dialog.deleteImageFailed"));
  }
}

// ===== 大小写转换（作用于选区，无选区时不动，避免误改与脏标记）=====

function transformSelection(fn: (s: string) => string): void {
  if (!view) return;
  const sel = view.state.selection.main;
  if (sel.from === sel.to) return;
  const text = view.state.sliceDoc(sel.from, sel.to);
  const replaced = fn(text);
  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert: replaced },
    selection: { anchor: sel.from, head: sel.from + replaced.length },
  });
  focusAndSync();
}

export function transformUpper(): void {
  transformSelection((s) => s.toUpperCase());
}

export function transformLower(): void {
  transformSelection((s) => s.toLowerCase());
}

/** 每个单词首字母大写、其余小写（Unicode 感知）。 */
export function transformCapitalize(): void {
  transformSelection((s) =>
    s.toLowerCase().replace(/\p{L}+/gu, (w) => w.charAt(0).toUpperCase() + w.slice(1))
  );
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard API unavailable (older webview) — ignore.
  }
}

export async function editorCopy(): Promise<void> {
  const text = selectedText();
  if (text) await copyText(text);
}

export async function editorCut(): Promise<void> {
  const text = selectedText();
  if (!text) return;
  await copyText(text);
  deleteSelection();
}

export async function editorPaste(): Promise<void> {
  let text: string;
  try {
    text = await navigator.clipboard.readText();
  } catch {
    return; // clipboard read denied
  }
  if (text) insertAtCursor(text);
}

export function editorSelectAll(): void {
  if (!view) return;
  view.dispatch({
    selection: { anchor: 0, head: view.state.doc.length },
  });
  view.focus();
}

// ===== Clipboard-only menu hooks (read-only preview surface) =====

/** Copy the DOM selection (read-only preview surface, outside CodeMirror). */
export async function copySelectionText(): Promise<void> {
  const text = window.getSelection()?.toString() ?? "";
  if (text) await copyText(text);
}

/** Read the clipboard and insert into the active editable surface. */
export async function pasteFromClipboardIntoActive(): Promise<void> {
  let text = "";
  try {
    text = await navigator.clipboard.readText();
  } catch {
    return; // clipboard read denied
  }
  if (!text) return;
  if (view) insertAtCursor(text);
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function extFromMime(mime: string): string {
  const sub = mime.split("/")[1] || "png";
  return sub.replace("jpeg", "jpg").replace("svg+xml", "svg");
}

/**
 * Save a pasted image next to the current note and return its relative path.
 */
export async function savePastedImage(file: File): Promise<string | null> {
  if (!editor.path) return null;
  const buf = await file.arrayBuffer();
  const b64 = arrayBufferToBase64(buf);
  const ext = file.type.startsWith("image/")
    ? extFromMime(file.type)
    : (file.name.split(".").pop() || "png").toLowerCase();
  return api.savePasteImage(editor.path, ext, b64);
}

export function insertAtCursor(text: string): void {
  const v = requireView();
  const pos = v.state.selection.main.to;
  v.dispatch({
    changes: { from: pos, to: pos, insert: text },
    selection: { anchor: pos + text.length },
    scrollIntoView: true,
  });
  focusAndSync();
}

// ===== 粘贴 HTML → Markdown（表格 + 表格间的文字一并保留）=====

/** 表格单元格文本：<br> 折叠为空格，内部空白（含 &nbsp;）压缩，竖线转义。 */
function cellText(cell: Element): string {
  const clone = cell.cloneNode(true) as Element;
  clone.querySelectorAll("br").forEach((br) => br.replaceWith(document.createTextNode(" ")));
  return clone.textContent?.replace(/\s+/g, " ").trim().replace(/\|/g, "\\|") ?? "";
}

/** 行内片段整理：压缩空格（保留换行）、去首尾空白。 */
function tidy(s: string): string {
  return s.replace(/[ \t\u00a0]+/g, " ").replace(/\n{2,}/g, "\n").trim();
}

/** 元素内部是否含块级子元素（需要递归展开，而非当作一行行内文本）。 */
function hasBlockChild(el: Element): boolean {
  return !!el.querySelector("table, p, div, ul, ol, blockquote, pre, h1, h2, h3, h4, h5, h6");
}

/** 行内节点 → Markdown 行内文本（粗/斜/删除线/行内代码/链接/图片）。 */
function inlineToMarkdown(node: Node, skip: ReadonlySet<Element>): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node as Element;
  if (skip.has(el)) return "";
  const wrap = (mark: string): string => {
    const t = tidy(inlineOfChildren(el, skip));
    return t ? mark + t + mark : "";
  };
  switch (el.tagName.toLowerCase()) {
    case "br":
      return "\n";
    case "strong":
    case "b":
      return wrap("**");
    case "em":
    case "i":
      return wrap("*");
    case "del":
    case "s":
    case "strike":
      return wrap("~~");
    case "code": {
      const t = (el.textContent ?? "").trim();
      return t ? "`" + t.replace(/`/g, "'") + "`" : "";
    }
    case "a": {
      const t = tidy(inlineOfChildren(el, skip));
      const href = el.getAttribute("href") ?? "";
      if (t && href && !/^(javascript:|#)/i.test(href)) return `[${t}](${href})`;
      return t;
    }
    case "img": {
      const src = el.getAttribute("src") ?? "";
      return src ? `![${(el.getAttribute("alt") ?? "").trim()}](${src})` : "";
    }
    case "script":
    case "style":
    case "meta":
    case "link":
      return "";
    default:
      return inlineOfChildren(el, skip);
  }
}

function inlineOfChildren(el: Element, skip: ReadonlySet<Element> = new Set()): string {
  let s = "";
  for (const n of Array.from(el.childNodes)) s += inlineToMarkdown(n, skip);
  return s;
}

/** 单个 <table> → Markdown 表格（首个行为表头）。 */
function tableToMarkdown(table: Element): string | null {
  const rows: string[][] = [];
  let width = 0;
  for (const tr of table.querySelectorAll("tr")) {
    const cells = Array.from(tr.querySelectorAll("td, th"));
    if (!cells.length) continue;
    const row: string[] = [];
    for (const cell of cells) {
      const span = Math.max(1, parseInt(cell.getAttribute("colspan") ?? "1", 10) || 1);
      const text = cellText(cell);
      for (let i = 0; i < span; i++) row.push(text);
    }
    rows.push(row);
    width = Math.max(width, row.length);
  }
  if (!rows.length || width === 0) return null;
  // 补齐为矩形（列数 = 最宽行；不足的补空单元格）
  const pad = (row: string[]) => {
    const filled = row.slice(0, width);
    while (filled.length < width) filled.push("");
    return filled;
  };
  return [
    "| " + pad(rows[0]).join(" | ") + " |",
    "| " + Array.from({ length: width }, () => "---").join(" | ") + " |",
    ...rows.slice(1).map((r) => "| " + pad(r).join(" | ") + " |"),
  ].join("\n");
}

/** 列表（含嵌套）→ "- " / "1. " 行，子列表缩进两空格。 */
function listToLines(list: Element, depth: number): string {
  const ordered = list.tagName.toLowerCase() === "ol";
  const indent = "  ".repeat(depth);
  const lines: string[] = [];
  let n = 1;
  for (const li of Array.from(list.children)) {
    if (li.tagName.toLowerCase() !== "li") continue;
    const nested = Array.from(li.children).filter((c) =>
      ["ul", "ol"].includes(c.tagName.toLowerCase())
    );
    const text = tidy(inlineOfChildren(li, new Set(nested)));
    lines.push(indent + (ordered ? `${n++}. ` : "- ") + text);
    for (const nl of nested) lines.push(listToLines(nl, depth + 1));
  }
  return lines.filter(Boolean).join("\n");
}

/** 按文档顺序收集块级内容：表格转表格，其余转标题/段落/列表/引用/代码块。 */
function pushBlock(node: Node, out: string[], depth: number): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = tidy(node.textContent ?? "");
    if (text) out.push(text);
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as Element;
  switch (el.tagName.toLowerCase()) {
    case "table":
      out.push(tableToMarkdown(el) ?? "");
      return;
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6": {
      const text = tidy(inlineOfChildren(el));
      if (text) out.push("#".repeat(Number(el.tagName[1])) + " " + text);
      return;
    }
    case "ul":
    case "ol":
      out.push(listToLines(el, depth));
      return;
    case "blockquote": {
      const inner: string[] = [];
      if (hasBlockChild(el)) {
        for (const c of Array.from(el.childNodes)) pushBlock(c, inner, depth);
      } else {
        const t = tidy(inlineOfChildren(el));
        if (t) inner.push(t);
      }
      const quoted = inner
        .filter(Boolean)
        .map((l) => l.split("\n").map((seg) => "> " + seg).join("\n"))
        .join("\n");
      if (quoted) out.push(quoted);
      return;
    }
    case "pre":
      out.push("```\n" + (el.textContent ?? "").replace(/^\n+|\n+$/g, "") + "\n```");
      return;
    case "br":
      return;
    case "script":
    case "style":
    case "head":
    case "title":
    case "meta":
    case "link":
      return;
    default: {
      // p / div / section 等容器与散落的行内元素：含块级子元素则递归展开，
      // 否则整段压成一行行内文本。
      if (hasBlockChild(el)) {
        for (const c of Array.from(el.childNodes)) pushBlock(c, out, depth);
      } else {
        const text = tidy(inlineOfChildren(el));
        if (text) out.push(text);
      }
      return;
    }
  }
}

/**
 * 剪贴板 HTML → Markdown：按文档顺序转换表格（→ Markdown 表格）、
 * 标题（→ #）、段落/列表/引用/代码块/行内样式，表格之间的文字不丢失。
 * Markdown 无嵌套表格：内层表格降级为空格。
 * HTML 中没有表格时返回 null（走编辑器默认的纯文本粘贴）。
 */
export function markdownFromClipboardHtml(html: string): string | null {
  if (!/<table[\s>]/i.test(html)) return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, style, meta, link, noscript, title").forEach((el) => el.remove());
  doc.querySelectorAll("table table").forEach((nested) =>
    nested.replaceWith(document.createTextNode(" "))
  );
  const out: string[] = [];
  for (const node of Array.from(doc.body.childNodes)) pushBlock(node, out, 0);
  const joined = out
    .map((b) => b.trim())
    .filter(Boolean)
    .join("\n\n");
  return joined || null;
}

/**
 * 粘贴语义插入转换结果（替换选区），首尾按需补空行——
 * 表格行/标题紧贴段落文字时不会被解析。
 */
export function insertMarkdownBlock(md: string): void {
  const v = requireView();
  const sel = v.state.selection.main;
  const fromLine = v.state.doc.lineAt(sel.from);
  const toLine = v.state.doc.lineAt(sel.to);
  const before = fromLine.text.slice(0, sel.from - fromLine.from);
  const after = toLine.text.slice(sel.to - toLine.from);
  const prevLine = fromLine.number > 1 ? v.state.doc.line(fromLine.number - 1).text : "";
  const nextLine = toLine.number < v.state.doc.lines ? v.state.doc.line(toLine.number + 1).text : "";
  // 光标行有残留文字 → 需断行 + 空行；行首但上一行非空 → 需一个空行
  const lead = before.trim() !== "" ? "\n\n" : prevLine.trim() !== "" ? "\n" : "";
  const tail = after.trim() !== "" || nextLine.trim() !== "" ? "\n\n" : "";
  const insert = lead + md + tail;
  v.dispatch({
    changes: { from: sel.from, to: sel.to, insert },
    selection: { anchor: sel.from + insert.length },
    scrollIntoView: true,
  });
  focusAndSync();
}

/** Replace the whole document (JSON/XML formatting), keeping undo history. */
export function replaceAllText(text: string): void {
  const v = requireView();
  v.dispatch({
    changes: { from: 0, to: v.state.doc.length, insert: text },
    selection: { anchor: Math.min(text.length, v.state.selection.main.anchor) },
    scrollIntoView: true,
  });
  focusAndSync();
}

// ===== 行尾硬换行补全（行尾两个空格 → Markdown 强制换行）=====

/** 围栏代码块开/闭行（缩进 ≤3 空格的 ``` / ~~~ ）。 */
const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/;
/** 行尾已是硬换行：≥2 空格、反斜杠或 <br> 标签。 */
const HARD_BREAK_TAIL_RE = /\s{2,}$|\\$|<br\s*\/?>$/i;

/**
 * 整篇检查：为每个会被单个换行折叠的行尾补上两个空格。跳过空行、
 * 围栏代码块内部（尾随空格在代码里有语义）、行尾已是硬换行
 * （空格 / 反斜杠 / <br>）的行，以及文档最后一行（其后没有换行）。
 * 编辑器内部恒为 \n（见 eol.ts），按行切分再合并不改变行尾约定。
 */
export function fixHardBreaks(): void {
  const lines = editor.content.split("\n");
  let inFence = false;
  let fenceChar = "";
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = FENCE_RE.exec(line);
    if (fence) {
      const ch = fence[1][0];
      if (!inFence) {
        inFence = true;
        fenceChar = ch;
      } else if (ch === fenceChar) {
        inFence = false;
      }
      continue; // 围栏行本身不动
    }
    if (inFence) continue;
    if (line.trim() === "") continue;
    if (i === lines.length - 1) continue;
    if (HARD_BREAK_TAIL_RE.test(line)) continue;
    lines[i] = line + "  ";
    count++;
  }
  if (count > 0) {
    replaceAllText(lines.join("\n"));
    showToast(t("format.brFixed", { count }));
  } else {
    showToast(t("format.brAlready"));
  }
}
