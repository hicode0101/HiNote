import type { EditorView } from "@codemirror/view";

// ===== 分屏模式滚动同步（编辑区 ⇄ 预览区）=====
// 两个组件各自把自己的实例/滚动容器注册进来；驱动侧把"顶部可见源码行"
// 通过 markdown-it 输出的 [data-line] 锚点映射到对侧。被驱动侧由程序写入
// scrollTop 产生的回声滚动事件用短时间窗抑制，避免两边互相追赶；
// scroll 事件经 rAF 合帧，长文档高频滚动时不做重复映射。
//
// 坐标换算依据 CodeMirror 内部约定：scrollDOM.scrollTop = 文档相对高度 +
// documentPadding.top（.cm-content 的 padding-top 计入滚动区，见
// viewState.getScrollOffset / scrollAnchorAt 的实现）。

const ECHO_MS = 120;

let cm: EditorView | null = null;
let preview: HTMLElement | null = null;
let editorEchoUntil = 0;
let previewEchoUntil = 0;
let editorRaf = 0;
let previewRaf = 0;

export function registerSplitEditor(view: EditorView | null): void {
  cm = view;
}

export function registerSplitPreview(el: HTMLElement | null): void {
  preview = el;
}

/** 编辑区滚动（分屏模式）：把预览区对齐到编辑区顶部可见源码行。 */
export function onEditorScrolled(): void {
  if (editorRaf) return;
  editorRaf = requestAnimationFrame(() => {
    editorRaf = 0;
    syncPreviewFromEditor();
  });
}

/** 预览区滚动（分屏模式）：让编辑区跟随预览区顶部锚点对应的源码行。 */
export function onPreviewScrolled(): void {
  if (previewRaf) return;
  previewRaf = requestAnimationFrame(() => {
    previewRaf = 0;
    syncEditorFromPreview();
  });
}

/**
 * 编辑区 → 预览区。取编辑区顶部可见源码行，找预览区中最后一个
 * data-line ≤ 该行的块级元素，将其顶端对齐到预览容器顶端。
 * 进入分屏时的初始对齐与内容变化后的跟随也直接调用本函数。
 */
export function syncPreviewFromEditor(): void {
  if (!cm || !preview) return;
  if (performance.now() < editorEchoUntil) return;
  const padTop = cm.documentPadding.top;
  const block = cm.lineBlockAtHeight(Math.max(0, cm.scrollDOM.scrollTop - padTop));
  const line0 = cm.state.doc.lineAt(block.from).number - 1;

  const target = anchorForLine(preview, line0);
  previewEchoUntil = performance.now() + ECHO_MS;
  if (!target) {
    preview.scrollTop = 0;
    return;
  }
  // 相对当前滚动位置求差值，等价于绝对定位 target 文档顶部到容器顶端。
  const delta = target.getBoundingClientRect().top - preview.getBoundingClientRect().top;
  preview.scrollTop += delta;
}

/**
 * 预览区 → 编辑区。找预览容器顶端之上最后一个 data-line 锚点，
 * 把编辑区滚动到该锚点对应的源码行。
 */
export function syncEditorFromPreview(): void {
  if (!cm || !preview) return;
  if (performance.now() < previewEchoUntil) return;

  const contTop = preview.getBoundingClientRect().top;
  let line0 = -1;
  for (const el of preview.querySelectorAll<HTMLElement>("[data-line]")) {
    if (el.getBoundingClientRect().bottom <= contTop + 1) {
      line0 = Number(el.getAttribute("data-line"));
    } else {
      break; // 文档序即行序，遇到第一个仍在顶端之下的锚点即可停止
    }
  }

  editorEchoUntil = performance.now() + ECHO_MS;
  if (line0 < 0) {
    cm.scrollDOM.scrollTop = 0;
    return;
  }
  const line = cm.state.doc.line(Math.min(line0 + 1, cm.state.doc.lines));
  cm.scrollDOM.scrollTop = cm.lineBlockAt(line.from).top + cm.documentPadding.top;
}

/** 最后一个 data-line ≤ line0 的锚点（文档序遍历，行号单调递增）。 */
function anchorForLine(root: HTMLElement, line0: number): HTMLElement | null {
  let best: HTMLElement | null = null;
  for (const el of root.querySelectorAll<HTMLElement>("[data-line]")) {
    const l = Number(el.getAttribute("data-line"));
    if (l <= line0) best = el;
    else break;
  }
  return best;
}
