<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from "vue";
import { SearchQuery, setSearchQuery, findNext, findPrevious, replaceNext, replaceAll } from "@codemirror/search";
import { getEditorView } from "@/lib/markdownActions";
import { t } from "@/lib/i18n";
import { editor } from "@/stores/editor";
import Icon from "./Icon.vue";

const visible = ref(false);
const query = ref("");
const replaceText = ref("");
const showReplace = ref(false);
const caseSensitive = ref(false);
const count = ref(0);
const current = ref(0);
const inputEl = ref<HTMLInputElement | null>(null);
const replaceEl = ref<HTMLInputElement | null>(null);

function buildQuery(): SearchQuery {
  return new SearchQuery({
    search: query.value,
    replace: replaceText.value,
    caseSensitive: caseSensitive.value,
    regexp: false,
    wholeWord: false,
  });
}

function view() {
  return getEditorView();
}

/** Push the query into CM and recompute match count + current index. */
function apply(): void {
  const v = view();
  if (!v) return;
  v.dispatch({ effects: setSearchQuery.of(buildQuery()) });
  refreshCount();
}

function refreshCount(): void {
  const v = view();
  if (!v || !query.value) {
    count.value = 0;
    current.value = 0;
    return;
  }
  const sel = v.state.selection.main;
  let total = 0;
  let idx = 0;
  const it = buildQuery().getCursor(v.state.doc);
  for (let r = it.next(); !r.done; r = it.next()) {
    total++;
    if (r.value.from === sel.from) idx = total;
  }
  // Selection between matches: show the index of the first match after it.
  if (!idx) {
    let before = 0;
    const it2 = buildQuery().getCursor(v.state.doc);
    for (let r = it2.next(); !r.done; r = it2.next()) {
      if (r.value.from > sel.from) break;
      before++;
    }
    idx = before;
  }
  count.value = total;
  current.value = idx;
}

function goTo(dir: 1 | -1): void {
  const v = view();
  if (!v || !query.value) return;
  apply();
  if (dir === 1) findNext(v);
  else findPrevious(v);
  refreshCount();
}

function doReplace(): void {
  const v = view();
  if (!v || !query.value) return;
  apply();
  replaceNext(v);
  refreshCount();
}

function doReplaceAll(): void {
  const v = view();
  if (!v || !query.value) return;
  apply();
  replaceAll(v);
  refreshCount();
}

function onInput(): void {
  apply();
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    close();
  } else if (e.key === "Enter") {
    e.preventDefault();
    goTo(e.shiftKey ? -1 : 1);
  } else if (e.key === "Tab") {
    // Move focus between the two inputs when the replace row is visible.
    if (!showReplace.value) return;
    e.preventDefault();
    (e.shiftKey ? inputEl.value : replaceEl.value)?.focus();
  }
}

/** Open with the current selection (single-line) as the initial query. */
function open(): void {
  const v = view();
  if (v) {
    const sel = v.state.sliceDoc(v.state.selection.main.from, v.state.selection.main.to);
    if (sel && !sel.includes("\n")) query.value = sel;
    v.dispatch({ effects: setSearchQuery.of(buildQuery()) });
  }
  visible.value = true;
  void nextTick(() => {
    inputEl.value?.focus();
    inputEl.value?.select();
    refreshCount();
  });
}

function close(): void {
  visible.value = false;
  view()?.focus();
}

defineExpose({ open });

// Keep the count fresh while typing in the document.
watch(
  () => editor.content,
  () => {
    if (visible.value) refreshCount();
  }
);
watch(caseSensitive, () => {
  if (visible.value) apply();
});

onUnmounted(() => {
  // Drop the query so CM's own Match highlighting doesn't linger.
  const v = view();
  if (v) v.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: "" })) });
});
</script>

<template>
  <transition name="searchpop">
    <div v-if="visible" class="search-panel" @keydown="onKeydown" @keydown.stop>
      <div class="search-row">
        <button
          class="expand-btn"
          :class="{ on: showReplace }"
          :title="t('search.toggleReplace')"
          @click="showReplace = !showReplace"
        >
          <Icon :name="showReplace ? 'chevronDown' : 'chevronRight'" :size="14" />
        </button>
        <input
          ref="inputEl"
          v-model="query"
          class="search-input"
          :placeholder="t('search.placeholder')"
          spellcheck="false"
          @input="onInput"
        />
        <button
          class="case-btn"
          :class="{ on: caseSensitive }"
          :title="t('search.caseSensitive')"
          @click="caseSensitive = !caseSensitive"
        >
          Aa
        </button>
        <span class="match-count" :class="{ none: !count }">
          {{ query ? `${current} / ${count}` : "" }}
        </span>
        <button class="nav-btn" :title="t('search.prev')" :disabled="!count" @click="goTo(-1)">
          <Icon name="chevronUp" :size="15" />
        </button>
        <button class="nav-btn" :title="t('search.next')" :disabled="!count" @click="goTo(1)">
          <Icon name="chevronDown" :size="15" />
        </button>
        <button class="nav-btn" :title="t('settings.close')" @click="close">
          <Icon name="dismiss" :size="15" />
        </button>
      </div>

      <div v-if="showReplace" class="search-row replace-row">
        <span class="expand-spacer"></span>
        <input
          ref="replaceEl"
          v-model="replaceText"
          class="search-input"
          :placeholder="t('search.replacePlaceholder')"
          spellcheck="false"
        />
        <button class="txt-btn" :disabled="!count" :title="t('search.replace')" @click="doReplace">
          {{ t("search.replace") }}
        </button>
        <button class="txt-btn" :disabled="!count" :title="t('search.replaceAll')" @click="doReplaceAll">
          {{ t("search.replaceAll") }}
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
  display: flex;
  flex-direction: column;
  gap: 6px;
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

.expand-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 22px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}
.expand-btn:hover {
  background: var(--bg-hover);
}
.expand-btn.on {
  color: var(--accent);
}
.expand-spacer {
  flex-shrink: 0;
  width: 22px;
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
  font-family: var(--font-mono);
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

.txt-btn {
  flex-shrink: 0;
  height: 26px;
  padding: 0 9px;
  border: 1px solid var(--stroke);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}
.txt-btn:hover {
  background: var(--bg-hover);
}
.txt-btn:disabled {
  opacity: 0.4;
  cursor: default;
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
