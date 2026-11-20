<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { t } from "@/lib/i18n";
import { workspace, activateFile } from "@/stores/workspace";
import { settings, persistSettings, toggleSidebar } from "@/stores/settings";
import { api, baseName, isTauri, joinPath, type SearchHit } from "@/lib/tauri";
import { langIcon, langColorClass, type LangId } from "@/lib/languages";
import { createDocument, createFolder } from "@/lib/ops";
import TreeNodeItem from "./TreeNodeItem.vue";
import Icon from "./Icon.vue";

const workspaceName = computed(() =>
  settings.workspace ? baseName(settings.workspace) : ""
);

const filtered = computed(() => {
  const q = workspace.filter.trim().toLowerCase();
  if (!q) return workspace.tree;
  const match = (nodes: typeof workspace.tree): typeof workspace.tree => {
    const out: typeof workspace.tree = [];
    for (const node of nodes) {
      if (node.kind === "dir") {
        const children = match(node.children);
        if (node.name.toLowerCase().includes(q) || children.length) {
          out.push({ ...node, children });
        }
      } else if (node.name.toLowerCase().includes(q)) {
        out.push(node);
      }
    }
    return out;
  };
  return match(workspace.tree);
});

// ---------------------------------------------------------------------------
// 全文搜索（Tauri 环境）：输入防抖后交给后端线程检索文件名与文档内容；
// 前端仅做竞态丢弃（seq 计数），保证快速输入时不卡顿、不闪烁过期结果。
// ---------------------------------------------------------------------------
const results = ref<SearchHit[]>([]);
const searching = ref(false);
const truncated = ref(false);
let searchSeq = 0;
let debounceTimer: number | null = null;

const searchActive = computed(
  () => workspace.filter.trim().length > 0 && isTauri()
);

watch(
  () => workspace.filter,
  (value) => {
    if (debounceTimer !== null) {
      window.clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    const q = value.trim();
    if (!q || !isTauri()) {
      searchSeq++;
      searching.value = false;
      truncated.value = false;
      results.value = [];
      return;
    }
    searching.value = true;
    debounceTimer = window.setTimeout(() => {
      debounceTimer = null;
      void runSearch(q);
    }, 250);
  }
);

onBeforeUnmount(() => {
  if (debounceTimer !== null) window.clearTimeout(debounceTimer);
});

async function runSearch(query: string): Promise<void> {
  const seq = ++searchSeq;
  try {
    const out = await api.searchWorkspace(query, 100);
    if (seq !== searchSeq) return; // 已有更新的搜索，丢弃过期结果
    results.value = out.hits;
    truncated.value = out.truncated;
  } catch {
    if (seq === searchSeq) {
      results.value = [];
      truncated.value = false;
    }
  } finally {
    if (seq === searchSeq) searching.value = false;
  }
}

function clearFilter(): void {
  workspace.filter = "";
}

function openHit(hit: SearchHit): void {
  if (hit.kind === "dir") {
    revealDir(hit.path);
    return;
  }
  void activateFile(hit.path);
}

/** 关闭搜索并在目录树中展开该文件夹的各级祖先，使其可见。 */
function revealDir(path: string): void {
  const root = settings.workspace;
  if (root) {
    const rootNorm = root.replace(/[\\/]+$/, "");
    if (path.toLowerCase().startsWith(rootNorm.toLowerCase())) {
      const rel = path.slice(rootNorm.length).replace(/^[\\/]+/, "");
      let acc = rootNorm;
      for (const part of rel.split(/[\\/]/)) {
        acc = joinPath(acc, part);
        workspace.expanded.add(acc);
      }
    }
  }
  clearFilter();
}

function hitIcon(hit: SearchHit): string {
  if (hit.kind === "dir") return "folder";
  return langIcon((hit.file_type || null) as LangId | null);
}
function hitIconClass(hit: SearchHit): string {
  if (hit.kind === "dir") return "";
  return langColorClass((hit.file_type || null) as LangId | null);
}

interface Seg {
  text: string;
  hit: boolean;
}

/** 按关键词（大小写不敏感）把文本切成普通 / 命中片段供高亮渲染。 */
function splitHighlight(text: string, query: string): Seg[] {
  const needle = query.toLowerCase();
  if (!needle) return [{ text, hit: false }];
  const lower = text.toLowerCase();
  const out: Seg[] = [];
  let from = 0;
  for (;;) {
    const idx = lower.indexOf(needle, from);
    if (idx < 0) {
      if (from < text.length) out.push({ text: text.slice(from), hit: false });
      break;
    }
    if (idx > from) out.push({ text: text.slice(from, idx), hit: false });
    out.push({ text: text.slice(idx, idx + needle.length), hit: true });
    from = idx + needle.length;
  }
  return out;
}

const queryText = computed(() => workspace.filter.trim());
const nameSegs = (hit: SearchHit): Seg[] => splitHighlight(hit.name, queryText.value);
const snippetSegs = (hit: SearchHit): Seg[] =>
  splitHighlight(hit.snippet ?? "", queryText.value);

function changeWorkspace(): void {
  settings.workspace = null;
  void persistSettings();
}

function onTreeContext(e: MouseEvent): void {
  // Blank area of the tree = root operations.
  if ((e.target as HTMLElement).closest(".tree-row, .hit-row")) return;
  e.preventDefault();
  import("@/stores/ui").then((m) => m.openContextMenu(e.clientX, e.clientY, null));
}
</script>

<template>
  <aside class="sidebar">
    <div class="search-wrap">
      <Icon name="search" :size="15" class="search-icon" />
      <input
        v-model="workspace.filter"
        class="search-input"
        type="text"
        :placeholder="t('sidebar.search')"
        @keydown.esc="clearFilter"
      />
      <button v-if="workspace.filter" class="search-clear" :title="t('preview.close')" @click="clearFilter">
        <Icon name="dismiss" :size="13" />
      </button>
    </div>

    <div class="side-header">
      <span class="side-title">{{ searchActive ? t("sidebar.results") : t("app.allNotes") }}</span>
      <div class="side-actions">
        <button class="icon-btn" :title="t('sidebar.newNote')" @click="createDocument(settings.workspace!)">
          <Icon name="documentPlus" :size="16" />
        </button>
        <button class="icon-btn" :title="t('sidebar.newFolder')" @click="createFolder(settings.workspace!)">
          <Icon name="folderPlus" :size="16" />
        </button>
        <button class="icon-btn" :title="t('sidebar.collapse')" @click="toggleSidebar">
          <Icon name="chevronLeft" :size="16" />
        </button>
      </div>
    </div>

    <div class="tree-scroll" @contextmenu="onTreeContext">
      <!-- 全文搜索结果 -->
      <template v-if="searchActive">
        <div v-if="searching && !results.length" class="tree-empty">{{ t("sidebar.searching") }}</div>
        <div v-else-if="!results.length" class="tree-empty">{{ t("sidebar.noMatch") }}</div>
        <template v-else>
          <div v-if="truncated" class="search-note">
            {{ t("sidebar.truncated", { n: results.length }) }}
          </div>
          <ul class="hit-list">
            <li
              v-for="hit in results"
              :key="hit.path"
              class="hit-row"
              :class="{ active: hit.kind === 'file' && workspace.activePath === hit.path }"
              :title="hit.path"
              @click="openHit(hit)"
            >
              <Icon :name="hitIcon(hit)" :size="16" class="hit-icon" :class="hitIconClass(hit)" />
              <div class="hit-main">
                <div class="hit-name-line">
                  <span class="hit-name">
                    <template v-for="(seg, i) in nameSegs(hit)" :key="i">
                      <mark v-if="seg.hit">{{ seg.text }}</mark>
                      <template v-else>{{ seg.text }}</template>
                    </template>
                  </span>
                  <span v-if="hit.rel_dir" class="hit-dir" :title="hit.rel_dir">{{ hit.rel_dir }}</span>
                </div>
                <div v-if="hit.snippet" class="hit-snippet">
                  <template v-for="(seg, i) in snippetSegs(hit)" :key="i">
                    <mark v-if="seg.hit">{{ seg.text }}</mark>
                    <template v-else>{{ seg.text }}</template>
                  </template>
                </div>
              </div>
            </li>
          </ul>
        </template>
      </template>

      <!-- 目录树 -->
      <template v-else>
        <div v-if="!workspace.tree.length && !workspace.loading" class="tree-empty">
          {{ workspace.error ? t("welcome.workspaceMissing") : t("sidebar.empty") }}
        </div>
        <div v-else-if="!filtered.length" class="tree-empty">{{ t("sidebar.noMatch") }}</div>
        <ul v-else class="tree-root">
          <TreeNodeItem
            v-for="node in filtered"
            :key="node.path"
            :node="node"
            :depth="0"
            :filter-active="!!workspace.filter.trim()"
          />
        </ul>
      </template>
    </div>

    <div class="side-footer">
      <Icon name="folder" :size="15" class="footer-icon" />
      <div class="footer-info">
        <div class="footer-name">{{ workspaceName }}</div>
        <button class="footer-btn" @click="changeWorkspace">
          {{ t("sidebar.changeWorkspace") }}
        </button>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  width: var(--sidebar-width);
  min-width: var(--sidebar-width);
  height: 100%;
  border-right: 1px solid var(--stroke);
  background: var(--bg-card);
  backdrop-filter: blur(20px);
}

.search-wrap {
  position: relative;
  margin: 10px 12px 4px;
}
.search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-tertiary);
  pointer-events: none;
}
.search-input {
  width: 100%;
  height: 32px;
  padding: 0 30px 0 32px;
  border: 1px solid var(--stroke-control);
  border-radius: var(--radius-sm);
  background: var(--bg-layer);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 13px;
  outline: none;
  user-select: text;
}
.search-input::placeholder {
  color: var(--text-tertiary);
}
.search-input:focus {
  border-color: var(--accent);
  border-bottom-width: 2px;
}
.search-clear {
  position: absolute;
  right: 5px;
  top: 50%;
  transform: translateY(-50%);
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  color: var(--text-tertiary);
  cursor: pointer;
}
.search-clear:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.side-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px 4px 16px;
}
.side-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  letter-spacing: 0.3px;
}
.side-actions {
  display: flex;
  gap: 2px;
}
.side-actions .icon-btn {
  width: 28px;
  height: 28px;
}

.tree-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 2px 8px 8px;
}

.tree-empty {
  padding: 24px 12px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 13px;
}

.search-note {
  margin: 2px 4px 6px;
  padding: 5px 8px;
  font-size: 11px;
  color: var(--text-tertiary);
  background: var(--bg-layer);
  border-radius: var(--radius-sm);
}

.hit-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.hit-row {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 6px 6px 6px 8px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.12s ease;
}
.hit-row:hover {
  background: var(--bg-hover);
}
.hit-row.active {
  background: var(--accent-subtle-bg);
}
.hit-row.active .hit-name {
  color: var(--accent);
  font-weight: 600;
}
.hit-icon {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--text-tertiary);
}
/* File-type color highlighting (same palette as the tree). */
.hit-icon.type-md {
  color: var(--accent);
}
.hit-icon.type-txt {
  color: var(--text-secondary);
}
.hit-icon.type-pdf {
  color: #c42b1c;
}
.hit-icon.type-image {
  color: #0f7b6c;
}
.hit-icon.type-code {
  color: #8250df;
}
.hit-main {
  flex: 1;
  min-width: 0;
}
.hit-name-line {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.hit-name {
  flex: 0 1 auto;
  min-width: 0;
  font-size: 13px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hit-dir {
  flex: 1 1 0;
  min-width: 0;
  font-size: 11px;
  color: var(--text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: right;
}
.hit-snippet {
  margin-top: 2px;
  font-size: 11px;
  line-height: 1.45;
  color: var(--text-secondary);
  word-break: break-all;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.hit-row mark {
  background: rgba(250, 200, 60, 0.35);
  color: inherit;
  border-radius: 2px;
  padding: 0 1px;
}

.tree-root,
.tree-root :deep(ul) {
  list-style: none;
  margin: 0;
  padding: 0;
}

.side-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid var(--stroke);
}
.footer-icon {
  color: var(--accent);
}
.footer-info {
  min-width: 0;
}
.footer-name {
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.footer-btn {
  border: none;
  background: transparent;
  padding: 0;
  font-size: 11px;
  color: var(--text-secondary);
  cursor: pointer;
}
.footer-btn:hover {
  color: var(--accent);
  text-decoration: underline;
}
</style>
