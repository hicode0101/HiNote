<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import { EditorState, Compartment, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { editor, onContentChange, flushSave } from "@/stores/editor";
import { openEditorMenu } from "@/stores/ui";
import { resolvedTheme } from "@/lib/theme";
import { registerEditorView, savePastedImage, insertAtCursor } from "@/lib/markdownActions";

const host = ref<HTMLElement | null>(null);
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
    },
    { dark }
  );
}

function themeExtensions(): Extension[] {
  const dark = resolvedTheme.value === "dark";
  return [editorTheme(dark), syntaxHighlighting(dark ? darkHighlight : lightHighlight)];
}

function baseExtensions(): Extension[] {
  return [
    history(),
    keymap.of([
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
      indentWithTab,
      {
        key: "Mod-s",
        preventDefault: true,
        run: () => {
          void flushSave();
          return true;
        },
      },
    ]),
    EditorView.lineWrapping,
    highlightSelectionMatches(),
    markdown({ codeLanguages: languages, base: markdownLanguage }),
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
  // Capture phase: run before CodeMirror's own paste handler so image pastes
  // (which may also carry text/html) don't get inserted twice.
  cmView.dom.addEventListener("paste", onPaste, true);
  host.value.addEventListener("contextmenu", onContextMenu);
}

function destroyView(): void {
  host.value?.removeEventListener("contextmenu", onContextMenu);
  cmView?.dom.removeEventListener("paste", onPaste, true);
  cmView?.destroy();
  cmView = null;
  registerEditorView(null);
}

function onContextMenu(e: MouseEvent): void {
  e.preventDefault();
  openEditorMenu(e.clientX, e.clientY);
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
// (e.g. mode switches from fluid -> classic).
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
  <div ref="host" class="cm-host"></div>
</template>
