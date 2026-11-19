<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import Vditor from "vditor";
import "vditor/dist/index.css";
import { editor, onContentChange } from "@/stores/editor";
import { resolvedTheme } from "@/lib/theme";
import { i18n, t } from "@/lib/i18n";
import { savePastedImage, registerEditorView } from "@/lib/markdownActions";
import { markdownToDisplay, markdownToSource, refToAbsPath, displayUrl } from "@/lib/imgSrc";
import { baseName } from "@/lib/tauri";

const host = ref<HTMLElement | null>(null);
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
});

watch(resolvedTheme, (theme) => {
  vditor?.setTheme(theme === "dark" ? "dark" : "classic");
});

watch(
  () => editor.path,
  () => {
    if (vditor) {
      boundGeneration = editor.generation;
      vditor.setValue(displayValue());
    }
  }
);

onUnmounted(() => {
  vditor?.destroy();
  vditor = null;
});
</script>

<template>
  <div class="fluid-host">
    <div ref="host" class="vditor-host"></div>
  </div>
</template>

<style scoped>
.fluid-host {
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
