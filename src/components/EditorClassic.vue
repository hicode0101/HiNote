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
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { oneDark } from "@codemirror/theme-one-dark";
import { editor, onContentChange, flushSave } from "@/stores/editor";
import { resolvedTheme } from "@/lib/theme";
import { registerEditorView, savePastedImage, insertAtCursor } from "@/lib/markdownActions";

const host = ref<HTMLElement | null>(null);
let cmView: EditorView | null = null;

const themeCompartment = new Compartment();

function themeExtensions(): Extension[] {
  if (resolvedTheme.value === "dark") {
    return [
      oneDark,
      EditorView.theme({ "&": { backgroundColor: "var(--bg-layer)" } }, { dark: true }),
    ];
  }
  return [
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    EditorView.theme({ "&": { backgroundColor: "var(--bg-layer)" } }),
  ];
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
}

function destroyView(): void {
  cmView?.dom.removeEventListener("paste", onPaste, true);
  cmView?.destroy();
  cmView = null;
  registerEditorView(null);
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
