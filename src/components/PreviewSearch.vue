<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from "vue";
import { t } from "@/lib/i18n";
import { editor } from "@/stores/editor";
import Icon from "./Icon.vue";

/**
 * Find-in-page for DOM-rendered content (markdown preview):
 * VS Code-style floating panel, matches highlighted via the CSS Custom
 * Highlight API, navigation scrolls the active match into view. No replace
 * row — these surfaces are not replaced from here.
 */
const props = withDefaults(
  defineProps<{
    container: HTMLElement | null;
    contentSelector?: string;
    /** Panel offset below the anchor's top. */
    offsetTop?: number;
  }>(),
  { contentSelector: ".md-preview", offsetTop: 0 }
);

const visible = ref(false);
const query = ref("");
const caseSensitive = ref(false);
const matches = ref<Range[]>([]);
const current = ref(0); // 0-based active match
const inputEl = ref<HTMLInputElement | null>(null);

const HL_ALL = "preview-search";
const HL_ACTIVE = "preview-search-active";

function highlightSupported(): boolean {
  return "highlights" in CSS;
}

function clearHighlights(): void {
  if (!highlightSupported()) return;
  CSS.highlights.delete(HL_ALL);
  CSS.highlights.delete(HL_ACTIVE);
}

function collectTextNodes(root: Element): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n: Node) {
      const tag = n.parentElement?.tagName;
      if (tag === "SCRIPT" || tag === "STYLE") return NodeFilter.FILTER_REJECT;
      return (n as Text).nodeValue?.length ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  const out: Text[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) out.push(n as Text);
  return out;
}

/** Map a global offset in the concatenated text to (node, offset). */
function locate(nodes: Text[], offsets: number[], idx: number): { node: Text; offset: number } | null {
  for (let i = nodes.length - 1; i >= 0; i--) {
    if (idx >= offsets[i]) return { node: nodes[i], offset: idx - offsets[i] };
  }
  return null;
}

function searchInContainer(): void {
  clearHighlights();
  matches.value = [];
  current.value = 0;
  const container = props.container?.querySelector(props.contentSelector) ?? props.container;
  if (!container || !query.value) return;

  const nodes = collectTextNodes(container);
  const offsets: number[] = [];
  let totalLen = 0;
  const chunks: string[] = [];
  for (const tn of nodes) {
    const val = tn.nodeValue ?? "";
    chunks.push(val);
    offsets.push(totalLen);
    totalLen += val.length;
  }
  const hay = chunks.join("");
  const needle = query.value;
  const lowerHay = hay.toLowerCase();
  const lowerNeedle = needle.toLowerCase();

  const ranges: Range[] = [];
  let pos = 0;
  while (pos + needle.length <= totalLen) {
    const idx = caseSensitive.value ? hay.indexOf(needle, pos) : lowerHay.indexOf(lowerNeedle, pos);
    if (idx < 0) break;
    const start = locate(nodes, offsets, idx);
    const end = locate(nodes, offsets, idx + needle.length);
    if (!start || !end) break;
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    ranges.push(range);
    pos = idx + Math.max(needle.length, 1);
  }
  matches.value = ranges;
  if (highlightSupported() && ranges.length) {
    CSS.highlights.set(HL_ALL, new Highlight(...ranges));
  }
  if (ranges.length) goTo(0);
}

function goTo(i: number): void {
  if (!matches.value.length) return;
  current.value = (i + matches.value.length) % matches.value.length;
  const range = matches.value[current.value];
  if (highlightSupported()) {
    CSS.highlights.set(HL_ACTIVE, new Highlight(range));
  }
  const el = range.startContainer.parentElement;
  el?.scrollIntoView({ block: "center", behavior: "auto" });
}

function goToRelative(step: number): void {
  if (matches.value.length) goTo(current.value + step);
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    close();
  } else if (e.key === "Enter") {
    e.preventDefault();
    goToRelative(e.shiftKey ? -1 : 1);
  }
}

async function open(): Promise<void> {
  visible.value = true;
  await nextTick();
  inputEl.value?.focus();
  inputEl.value?.select();
  searchInContainer();
}

function close(): void {
  visible.value = false;
  query.value = "";
  clearHighlights();
}

defineExpose({ open });

watch(query, () => searchInContainer());
watch(caseSensitive, () => searchInContainer());
watch(
  () => editor.path + "\u0000" + editor.content,
  () => {
    if (visible.value) searchInContainer();
  }
);

onUnmounted(clearHighlights);
</script>

<template>
  <transition name="searchpop">
    <div
      v-if="visible"
      class="search-panel"
      :style="{ top: offsetTop + 'px' }"
      @keydown="onKeydown"
      @keydown.stop
    >
      <div class="search-row">
        <input
          ref="inputEl"
          v-model="query"
          class="search-input"
          :placeholder="t('search.placeholder')"
          spellcheck="false"
        />
        <button
          class="case-btn"
          :class="{ on: caseSensitive }"
          :title="t('search.caseSensitive')"
          @click="caseSensitive = !caseSensitive"
        >
          Aa
        </button>
        <span class="match-count" :class="{ none: !matches.length }">
          {{ query ? `${matches.length ? current + 1 : 0} / ${matches.length}` : "" }}
        </span>
        <button class="nav-btn" :title="t('search.prev')" :disabled="!matches.length" @click="goToRelative(-1)">
          <Icon name="chevronUp" :size="15" />
        </button>
        <button class="nav-btn" :title="t('search.next')" :disabled="!matches.length" @click="goToRelative(1)">
          <Icon name="chevronDown" :size="15" />
        </button>
        <button class="nav-btn" :title="t('settings.close')" @click="close">
          <Icon name="dismiss" :size="15" />
        </button>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.search-panel {
  position: absolute;
  top: 0;
  left: calc(50% - 210px);
  z-index: 60;
  width: 420px;
  max-width: calc(100% - 36px);
  padding: 8px;
  border: 1px solid var(--stroke);
  border-radius: var(--radius-md);
  background: var(--bg-layer);
  box-shadow: var(--shadow-flyout);
}

.search-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.search-input {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--stroke);
  border-radius: var(--radius-sm);
  background: var(--bg-subtle);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 13px;
}
.search-input:focus {
  outline: none;
  border-color: var(--accent);
}

.case-btn {
  flex-shrink: 0;
  height: 26px;
  padding: 0 7px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.case-btn:hover {
  background: var(--bg-hover);
}
.case-btn.on {
  background: var(--accent-subtle-bg);
  color: var(--accent);
}

.match-count {
  flex-shrink: 0;
  min-width: 44px;
  text-align: center;
  font-size: 12px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}
.match-count.none {
  color: var(--danger);
}

.nav-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
}
.nav-btn:hover {
  background: var(--bg-hover);
}
.nav-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.nav-btn:disabled:hover {
  background: transparent;
}

.searchpop-enter-active,
.searchpop-leave-active {
  transition: opacity 0.14s ease, transform 0.14s ease;
}
.searchpop-enter-from,
.searchpop-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
