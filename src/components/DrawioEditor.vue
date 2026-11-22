<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { t } from "@/lib/i18n";
import { api, baseName } from "@/lib/tauri";
import { DIO_TEMPLATE } from "@/lib/ops";
import { editor, flushSave, isDioFile, onContentChange } from "@/stores/editor";
import { settings } from "@/stores/settings";
import { registerDioExporter } from "@/stores/dio";
import { showToast } from "@/stores/ui";
import Icon from "./Icon.vue";

// ===== 内嵌 drawio 流程图编辑器（*.dio）=====
// 官方 drawio webapp（public/drawio，见 scripts/fetch-drawio.mjs）加载进
// 同源 iframe，走官方 embed JSON postMessage 协议：configure 握手后 load
// 打开文件；编辑产生的 autosave/save 事件回写 editor store（脏标记、自动
// 保存、Ctrl+S 全部复用现有文本链路）；导出经 export 动作取回 data URI，
// 交给原生保存对话框写盘（api.exportFileAs）。
//
// embed 模式自带完整菜单栏与左右面板（drawio 标准界面，图 1）；会绕过宿
// 主文件管理的菜单项（新建/打开/导出/退出等）经 hideMenuItems 隐藏，保存
// 保留（触发 save 事件）。外部修改、切换文件由 watch [path, generation]
// / content 差异检测后重新 load；自推内容不回灌，避免循环。

const frameEl = ref<HTMLIFrameElement | null>(null);
const ready = ref(false);
const bootFailed = ref(false);
const frameKey = ref(0);

// 名称是 drawio 菜单动作 id（Menus.js 中 addMenuItems/addSubmenu 的字符串）
const HIDDEN_MENU_ITEMS = [
  "new", "open", "openFrom", "openRecent", "importFrom",
  "saveAs", "exportAs", "print", "exit", "plugins",
];

const BOOT_TIMEOUT_MS = 30000;
const EXPORT_TIMEOUT_MS = 20000;

// 界面语言 / 主题跟随应用设置（修改设置会重建 iframe，握手后重新加载）
function dioLang(): string {
  if (settings.language === "zh-CN") return "zh";
  if (settings.language === "en-US") return "en";
  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}
function dioDark(): string {
  if (settings.theme === "dark") return "1";
  if (settings.theme === "light") return "0";
  return "auto";
}

const frameSrc = computed(() => {
  const p = new URLSearchParams({
    embed: "1",
    proto: "json",
    configure: "1",
    ui: "kennedy",
    libraries: "1",
    stealth: "1",
    splash: "0",
    // 保留 drawio 的"保存"按钮（发出 save 事件由宿主写盘），仅隐藏"退出"
    noExitBtn: "1",
    suppressNewWindows: "1",
    lang: dioLang(),
    dark: dioDark(),
  });
  return `/drawio/index.html?${p.toString()}`;
});

function post(msg: Record<string, unknown>): void {
  frameEl.value?.contentWindow?.postMessage(JSON.stringify(msg), "*");
}

// ===== 导出 =====

interface PendingExport {
  resolve: (data: string) => void;
  reject: (e: Error) => void;
  timer: number;
}
let pendingExport: PendingExport | null = null;

function utf8ToBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function doExport(format: "svg" | "png"): Promise<void> {
  if (!frameEl.value?.contentWindow || !ready.value) {
    showToast(t("dio.exportFailed"));
    return;
  }
  let data: string;
  try {
    data = await new Promise<string>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        pendingExport = null;
        reject(new Error("export_timeout"));
      }, EXPORT_TIMEOUT_MS);
      pendingExport = { resolve, reject, timer };
      post({ action: "export", format });
    });
  } catch {
    showToast(t("dio.exportFailed"));
    return;
  }
  if (!data) {
    showToast(t("dio.exportFailed"));
    return;
  }
  // drawio 返回 data URI（image/png / image/svg+xml，base64 或 URL 编码）
  const comma = data.indexOf(",");
  const meta = comma >= 0 ? data.slice(0, comma) : "";
  let b64 = comma >= 0 ? data.slice(comma + 1) : data;
  if (!/;base64/i.test(meta)) {
    try {
      b64 = utf8ToBase64(decodeURIComponent(b64));
    } catch {
      b64 = utf8ToBase64(b64); // 未编码的原文
    }
  }
  const stem = editor.path ? baseName(editor.path).replace(/\.dio$/i, "") : "diagram";
  try {
    const saved = await api.exportFileAs({
      dataBase64: b64,
      suggestedName: `${stem}.${format}`,
      filterName: format.toUpperCase(),
      extensions: [format],
    });
    if (saved) showToast(t("dio.savedTo", { path: saved }));
  } catch {
    showToast(t("dio.exportFailed"));
  }
}

// ===== 协议处理 =====

let lastPushedXml: string | null = null; // 最近一次已进入 iframe 的 XML

function onMessage(e: MessageEvent): void {
  if (!frameEl.value || e.source !== frameEl.value.contentWindow) return;
  let msg: unknown = e.data;
  if (typeof msg === "string") {
    try {
      msg = JSON.parse(msg);
    } catch {
      return;
    }
  }
  if (!msg || typeof msg !== "object") return;
  const m = msg as { event?: string; xml?: unknown; data?: unknown };
  switch (m.event) {
    case "configure":
      post({ action: "configure", config: { hideMenuItems: HIDDEN_MENU_ITEMS } });
      break;
    case "init": {
      ready.value = true;
      bootFailed.value = false;
      lastPushedXml = editor.content || DIO_TEMPLATE;
      post({
        action: "load",
        xml: lastPushedXml,
        autosave: 1,
        title: editor.path ? baseName(editor.path) : "diagram",
      });
      break;
    }
    case "autosave":
    case "save": {
      if (typeof m.xml !== "string" || !m.xml || !editor.path || !isDioFile()) return;
      onContentChange(m.xml);
      lastPushedXml = m.xml;
      if (m.event === "save") void flushSave();
      break;
    }
    case "export": {
      const pend = pendingExport;
      if (!pend) return;
      pendingExport = null;
      window.clearTimeout(pend.timer);
      pend.resolve(typeof m.data === "string" ? m.data : "");
      break;
    }
  }
}

// ===== 文件切换 / 外部修改 → 重新 load =====

function pushIfExternal(): void {
  if (!ready.value) return; // 未就绪时由 init 直接加载最新内容
  const xml = editor.content || DIO_TEMPLATE;
  if (xml === lastPushedXml) return;
  lastPushedXml = xml;
  post({ action: "load", xml });
}

watch(
  () => [editor.path, editor.generation] as const,
  () => {
    if (editor.path) pushIfExternal();
  }
);
watch(() => editor.content, () => pushIfExternal());

// ===== 启动超时与重试 =====

let bootTimer = 0;
function armBootTimer(): void {
  window.clearTimeout(bootTimer);
  ready.value = false;
  bootFailed.value = false;
  lastPushedXml = null;
  bootTimer = window.setTimeout(() => {
    if (!ready.value) bootFailed.value = true;
  }, BOOT_TIMEOUT_MS);
}
function retryBoot(): void {
  frameKey.value++; // 重建 iframe → 重新加载与握手
}

watch(frameKey, () => armBootTimer());

onMounted(() => {
  window.addEventListener("message", onMessage);
  armBootTimer();
  registerDioExporter(doExport);
});
onUnmounted(() => {
  window.removeEventListener("message", onMessage);
  registerDioExporter(null);
  window.clearTimeout(bootTimer);
  if (pendingExport) {
    window.clearTimeout(pendingExport.timer);
    pendingExport.reject(new Error("unmounted"));
    pendingExport = null;
  }
});
</script>

<template>
  <div class="dio-root">
    <iframe :key="frameKey" ref="frameEl" class="dio-frame" :src="frameSrc" title="drawio"></iframe>
    <div v-if="!ready" class="dio-overlay">
      <template v-if="!bootFailed">
        <Icon name="flowchart" :size="40" class="dio-boot-icon" />
        <div class="dio-overlay-text">{{ t("dio.loading") }}</div>
      </template>
      <template v-else>
        <Icon name="info" :size="36" class="dio-fail-icon" />
        <div class="dio-overlay-text">{{ t("dio.loadFailed") }}</div>
        <button class="btn dio-retry" @click="retryBoot">{{ t("dio.retry") }}</button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.dio-root {
  position: relative;
  flex: 1;
  height: 100%;
  min-height: 0;
  display: flex;
  background: var(--bg-layer);
}
.dio-frame {
  flex: 1;
  width: 100%;
  height: 100%;
  border: 0;
}
.dio-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: var(--bg-layer);
}
.dio-boot-icon {
  color: var(--accent);
  animation: dio-pulse 1.4s ease-in-out infinite;
}
.dio-fail-icon {
  color: #c42b1c;
}
.dio-overlay-text {
  font-size: 13px;
  color: var(--text-secondary);
}
.dio-retry {
  height: 30px;
}
@keyframes dio-pulse {
  0%, 100% { opacity: 0.35; }
  50% { opacity: 1; }
}
</style>
