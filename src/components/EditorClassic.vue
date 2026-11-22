<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import { EditorState, Compartment, type Extension } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { search } from "@codemirror/search";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { json } from "@codemirror/lang-json";
import { xml } from "@codemirror/lang-xml";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { java } from "@codemirror/lang-java";
import { cpp } from "@codemirror/lang-cpp";
import { go } from "@codemirror/lang-go";
import { rust } from "@codemirror/lang-rust";
import { sql } from "@codemirror/lang-sql";
import { php } from "@codemirror/lang-php";
import { StreamLanguage, HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { yaml } from "@codemirror/legacy-modes/mode/yaml";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { properties } from "@codemirror/legacy-modes/mode/properties";
import { csharp } from "@codemirror/legacy-modes/mode/clike";
import { tags as t } from "@lezer/highlight";
import { editor, onContentChange, flushSave, isMarkdownFile } from "@/stores/editor";
import { openEditorMenu } from "@/stores/ui";
import { resolvedTheme } from "@/lib/theme";
import { registerEditorView, savePastedImage, insertAtCursor, selectionImageFile, deleteSelectionCheckingImage } from "@/lib/markdownActions";
import { registerSplitEditor, onEditorScrolled } from "@/lib/splitSync";
import { formatDocument } from "@/lib/formatActions";
import { langForPath } from "@/lib/languages";
import { api } from "@/lib/tauri";
import { hasTreeFileData, readTreeFileData, refForTreeFile } from "@/lib/dropRef";
import EditorSearch from "./EditorSearch.vue";

const host = ref<HTMLElement | null>(null);
const searchRef = ref<InstanceType<typeof EditorSearch> | null>(null);
let cmView: EditorView | null = null;

const themeCompartment = new Compartment();

// VS Code-style token colors (ported from HiEditor FR-17 palette): blue bold
// headings without underline, red inline code, colored fenced code, etc.
const lightHighlight = HighlightStyle.define([
  { tag: t.keyword, color: "#0000ff" },
  { tag: [t.controlKeyword, t.moduleKeyword], color: "#af00db" },
  { tag: t.string, color: "#a31515" },
  { tag: t.number, color: "#098658" },
  { tag: t.comment, color: "#008000" },
  { tag: t.propertyName, color: "#0451a5" },
  { tag: t.labelName, color: "#0451a5" },
  { tag: t.tagName, color: "#800000" },
  { tag: t.attributeName, color: "#e50000" },
  { tag: t.typeName, color: "#267f99" },
  { tag: t.function(t.variableName), color: "#795e26" },
  { tag: t.definition(t.variableName), color: "#001080" },
  { tag: t.variableName, color: "#001080" },
  { tag: [t.bool, t.null], color: "#0000ff" },
  { tag: t.constant(t.name), color: "#0070c1" },
  { tag: t.operator, color: "#1b1b1b" },
  // Markdown / document markup
  { tag: t.heading, color: "#0000ff", "font-weight": "bold" },
  { tag: t.strong, color: "#1b1b1b", "font-weight": "bold" },
  { tag: t.emphasis, color: "#1b1b1b", "font-style": "italic" },
  { tag: t.strikethrough, color: "#696969", "text-decoration": "line-through" },
  { tag: t.link, color: "#0451a5", "text-decoration": "underline" },
  { tag: t.url, color: "#0451a5" },
  { tag: t.monospace, color: "#a31515" },
  { tag: t.contentSeparator, color: "#800000", "font-weight": "bold" },
  { tag: t.quote, color: "#5a5a5a", "font-style": "italic" },
  { tag: t.processingInstruction, color: "#800000" },
]);

const darkHighlight = HighlightStyle.define([
  { tag: t.keyword, color: "#569cd6" },
  { tag: [t.controlKeyword, t.moduleKeyword], color: "#c586c0" },
  { tag: t.string, color: "#ce9178" },
  { tag: t.number, color: "#b5cea8" },
  { tag: t.comment, color: "#6a9955" },
  { tag: t.propertyName, color: "#9cdcfe" },
  { tag: t.labelName, color: "#9cdcfe" },
  { tag: t.tagName, color: "#569cd6" },
  { tag: t.attributeName, color: "#9cdcfe" },
  { tag: t.typeName, color: "#4ec9b0" },
  { tag: t.function(t.variableName), color: "#dcdcaa" },
  { tag: t.definition(t.variableName), color: "#9cdcfe" },
  { tag: t.variableName, color: "#9cdcfe" },
  { tag: [t.bool, t.null], color: "#569cd6" },
  { tag: t.constant(t.name), color: "#4fc1ff" },
  { tag: t.operator, color: "#d4d4d4" },
  // Markdown / document markup
  { tag: t.heading, color: "#569cd6", "font-weight": "bold" },
  { tag: t.strong, color: "#e8e8e8", "font-weight": "bold" },
  { tag: t.emphasis, color: "#e8e8e8", "font-style": "italic" },
  { tag: t.strikethrough, color: "#808080", "text-decoration": "line-through" },
  { tag: t.link, color: "#3794ff", "text-decoration": "underline" },
  { tag: t.url, color: "#3794ff" },
  { tag: t.monospace, color: "#ce9178" },
  { tag: t.contentSeparator, color: "#569cd6", "font-weight": "bold" },
  { tag: t.quote, color: "#808080", "font-style": "italic" },
  { tag: t.processingInstruction, color: "#c586c0" },
]);

function editorTheme(dark: boolean): Extension {
  return EditorView.theme(
    {
      "&": {
        color: dark ? "#e8e8e8" : "#1b1b1b",
        backgroundColor: "var(--bg-layer)",
      },
      ".cm-content": {
        caretColor: dark ? "#e8e8e8" : "#1b1b1b",
        lineHeight: "1.5",
        padding: "8px 0 30vh",
      },
      ".cm-cursor, .cm-dropCursor": {
        borderLeftColor: dark ? "#e8e8e8" : "#1b1b1b",
        borderLeftWidth: "1.5px",
      },
      ".cm-selectionBackground": {
        backgroundColor: dark ? "#294d6e" : "#add6ff",
      },
      // Must outrank CodeMirror baseTheme's focused selection rule.
      "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
        backgroundColor: dark ? "#294d6e" : "#add6ff",
      },
      // 行号槽（参考 HiEditor 图1）：与编辑区同底色、无分隔边框，数字用弱化灰
      ".cm-gutters": {
        backgroundColor: "transparent",
        border: "none",
      },
      ".cm-lineNumbers .cm-gutterElement": {
        color: dark ? "#858585" : "#a1a1a1",
      },
    },
    { dark }
  );
}

function themeExtensions(): Extension[] {
  const dark = resolvedTheme.value === "dark";
  return [editorTheme(dark), syntaxHighlighting(dark ? darkHighlight : lightHighlight)];
}

// ===== 16 门代码语言 + JSON/XML（HiEditor 语言集合）=====
// Official Lezer packages where available; legacy-modes StreamLanguage for
// yaml/shell/ini/csharp, plus a hand-rolled batch lexer (no legacy mode).

// Windows 批处理（.bat/.cmd）：legacy-modes 无此模式，内置轻量流式词法
// （注释 ::/REM、@前缀、关键词、:标签、%VAR%/%1/%%p/!VAR! 变量、字符串、数字）
const batchLang = StreamLanguage.define({
  name: "batch",
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.match(/^::/)) { stream.skipToEnd(); return "comment"; }
    if (stream.match(/^@\s*rem\b/i) || stream.match(/^rem\b/i)) { stream.skipToEnd(); return "comment"; }
    if (stream.eat("@")) return "meta";
    if (stream.match(/^(?:echo|setlocal|endlocal|set|if|else|for|in|do|goto|call|exit|shift|pause|not|exist|defined|errorlevel|equ|neq|lss|leq|gtr|geq|cd|chdir|md|mkdir|rd|rmdir|del|erase|copy|xcopy|robocopy|move|ren|rename|type|start|pushd|popd|title|cls|color|ver|vol|label|choice|find|findstr|sort|more|tree|attrib|tasklist|taskkill|net)\b/i)) return "keyword";
    if (stream.match(/^:[A-Za-z_][\w.-]*/)) return "label";
    if (stream.match(/^![^!\n]+!/)) return "variable";
    if (stream.match(/^%%?[^%\s]+%?/)) return "variable";
    if (stream.match(/^"(?:[^"\n]|"")*"/)) return "string";
    if (stream.match(/^\d+/)) return "number";
    stream.next();
    return null;
  },
  languageData: { commentTokens: { line: "rem" } },
});

const langResolver: Record<string, () => Extension> = {
  md: () => markdown({ codeLanguages: languages, base: markdownLanguage }),
  json: () => json(),
  xml: () => xml(),
  html: () => html(),
  css: () => css(),
  javascript: () => javascript(),
  typescript: () => javascript({ typescript: true, jsx: true }),
  python: () => python(),
  java: () => java(),
  csharp: () => StreamLanguage.define(csharp),
  cpp: () => cpp(),
  go: () => go(),
  rust: () => rust(),
  sql: () => sql(),
  php: () => php(),
  yaml: () => StreamLanguage.define(yaml),
  shell: () => StreamLanguage.define(shell),
  ini: () => StreamLanguage.define(properties), // .ini/.cfg/.conf 键值语法（.toml 近似覆盖）
  batch: () => batchLang,
  txt: () => [],
};

function langExtension(path: string | null): Extension {
  const lang = langForPath(path);
  if (!lang) return [];
  const build = langResolver[lang];
  return build ? build() : [];
}

// Drop a tree file onto the editor → insert a note-relative image/link ref.
// Markdown notes only: elsewhere the drop is swallowed (no CM text insert of
// the raw path). Handled before CodeMirror's own text-drop.
function dropHandlers(): Extension {
  return EditorView.domEventHandlers({
    dragover: (event, _view) => {
      if (hasTreeFileData(event.dataTransfer)) event.preventDefault();
      return false;
    },
    drop: (event, view) => {
      const info = readTreeFileData(event.dataTransfer);
      if (!info) return false; // not ours — let CM handle normal text drops
      if (!editor.path || !isMarkdownFile()) {
        // Non-markdown target: no insertion at all.
        event.preventDefault();
        return true;
      }
      event.preventDefault();
      const pos =
        view.posAtCoords({ x: event.clientX, y: event.clientY }) ??
        view.state.selection.main.head;
      const insert = refForTreeFile(info, editor.path);
      view.dispatch({
        changes: { from: pos, insert },
        selection: { anchor: pos + insert.length },
        scrollIntoView: true,
      });
      view.focus();
      return true;
    },
  });
}

const URL_RE = /(?:https?:\/\/|mailto:)[^\s<>()"'`]+/g;

/** URL (if any) under `offset` within a line; trailing punctuation trimmed. */
function urlAtOffset(text: string, offset: number): string | null {
  URL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = URL_RE.exec(text))) {
    if (offset >= m.index && offset <= m.index + m[0].length) {
      return m[0].replace(/[.,;:!)\]]+$/, "");
    }
  }
  return null;
}

// Ctrl/Cmd+click a URL in the source editor → system default browser
// (plain click keeps normal caret behavior, like VS Code).
function linkHandlers(): Extension {
  return EditorView.domEventHandlers({
    mousedown: (event, view) => {
      if (event.button !== 0 || !(event.ctrlKey || event.metaKey)) return false;
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos == null) return false;
      const line = view.state.doc.lineAt(pos);
      const url = urlAtOffset(line.text, pos - line.from);
      if (!url) return false;
      event.preventDefault();
      void api.openUrl(url).catch(() => {});
      return true;
    },
  });
}

function baseExtensions(): Extension[] {
  return [
    history(),
    keymap.of([
      // Deleting a selection that is exactly one workspace image tag offers
      // to remove the physical file too. Listed before defaultKeymap so the
      // interception wins; returns false for any other deletion (default
      // char/selection removal, no prompt).
      { key: "Backspace", run: deleteImageTagSelection },
      { key: "Delete", run: deleteImageTagSelection },
      ...defaultKeymap,
      ...historyKeymap,
      indentWithTab,
      // Search: custom VS Code-style overlay instead of CM's built-in panel.
      {
        key: "Mod-f",
        preventDefault: true,
        run: () => {
          searchRef.value?.open();
          return true;
        },
      },
      {
        key: "Mod-s",
        preventDefault: true,
        run: () => {
          void flushSave();
          return true;
        },
      },
      // JSON/XML 格式化与压缩（HiEditor 快捷键：Ctrl+Shift+J/L 格式化，
      // Ctrl+Alt+J/L 压缩），仅对相应类型文件生效。
      {
        key: "Mod-Shift-j",
        preventDefault: true,
        run: () => {
          if (langForPath(editor.path) !== "json") return false;
          void formatDocument(false);
          return true;
        },
      },
      {
        key: "Mod-Alt-j",
        preventDefault: true,
        run: () => {
          if (langForPath(editor.path) !== "json") return false;
          void formatDocument(true);
          return true;
        },
      },
      {
        key: "Mod-Shift-l",
        preventDefault: true,
        run: () => {
          if (langForPath(editor.path) !== "xml") return false;
          void formatDocument(false);
          return true;
        },
      },
      {
        key: "Mod-Alt-l",
        preventDefault: true,
        run: () => {
          if (langForPath(editor.path) !== "xml") return false;
          void formatDocument(true);
          return true;
        },
      },
    ]),
    EditorView.lineWrapping,
    // 行号槽：编辑框左侧行号（图1 样式），全部文件类型通用
    lineNumbers(),
    // Provides the searchQuery state used by setSearchQuery/findNext/replace.
    // （不启用 highlightSelectionMatches：插入链接等操作会选中占位文本，
    // 触发全文同文高亮，误导用户以为所有链接都发生了变化）
    search(),
    langExtension(editor.path),
    dropHandlers(),
    linkHandlers(),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onContentChange(update.state.doc.toString());
      }
      if (update.selectionSet || update.docChanged) {
        const sel = update.state.selection.main;
        const line = update.state.doc.lineAt(sel.head);
        editor.cursor = { line: line.number, col: sel.head - line.from + 1 };
      }
    }),
    themeCompartment.of(themeExtensions()),
  ];
}

function buildView(): void {
  if (!host.value) return;
  cmView = new EditorView({
    state: EditorState.create({ doc: editor.content, extensions: baseExtensions() }),
    parent: host.value,
  });
  registerEditorView(cmView);
  registerSplitEditor(cmView);
  // Capture phase: run before CodeMirror's own paste handler so image pastes
  // (which may also carry text/html) don't get inserted twice.
  cmView.dom.addEventListener("paste", onPaste, true);
  cmView.scrollDOM.addEventListener("scroll", onCmScroll);
  host.value.addEventListener("contextmenu", onContextMenu);
}

function destroyView(): void {
  host.value?.removeEventListener("contextmenu", onContextMenu);
  if (cmView) {
    cmView.dom.removeEventListener("paste", onPaste, true);
    cmView.scrollDOM.removeEventListener("scroll", onCmScroll);
  }
  cmView?.destroy();
  cmView = null;
  registerEditorView(null);
  registerSplitEditor(null);
}

/** 分屏模式下编辑区滚动驱动预览区同步（仅 editor.view === "split" 时生效）。 */
function onCmScroll(): void {
  if (editor.view === "split") onEditorScrolled();
}

function onContextMenu(e: MouseEvent): void {
  e.preventDefault();
  openEditorMenu(e.clientX, e.clientY);
}

/** Backspace/Delete interceptor: full image-tag selection → file confirm flow. */
function deleteImageTagSelection(): boolean {
  if (!selectionImageFile()) return false;
  void deleteSelectionCheckingImage();
  return true;
}

async function onPaste(e: ClipboardEvent): Promise<void> {
  if (!editor.path) return;
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (!file) continue;
      e.preventDefault();
      e.stopPropagation(); // keep CM6 from also inserting clipboard text
      try {
        const rel = await savePastedImage(file);
        if (rel) insertAtCursor(`![](${rel})`);
      } catch (err) {
        console.error("save pasted image failed", err);
      }
      return;
    }
  }
}

// Reload the doc when a different file is opened.
watch(
  () => editor.path,
  () => {
    if (cmView) {
      cmView.setState(EditorState.create({ doc: editor.content, extensions: baseExtensions() }));
    }
  }
);

// Re-configure syntax theme when the app theme flips.
watch(resolvedTheme, () => {
  if (cmView) {
    cmView.dispatch({ effects: themeCompartment.reconfigure(themeExtensions()) });
  }
});

// Keep the editor in sync with content loaded/set programmatically
// (e.g. reloadFromDisk refreshing the open document).
watch(
  () => editor.content,
  (content) => {
    if (cmView && content !== cmView.state.doc.toString()) {
      cmView.dispatch({ changes: { from: 0, to: cmView.state.doc.length, insert: content } });
    }
  }
);

onMounted(buildView);
onUnmounted(destroyView);
</script>

<template>
  <div class="cm-wrap">
    <div ref="host" class="cm-host"></div>
    <EditorSearch ref="searchRef" />
  </div>
</template>

<style scoped>
.cm-wrap {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
</style>
