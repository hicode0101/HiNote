import { reactive } from "vue";
import { api, AppConfig } from "@/lib/tauri";
import { applyTheme, ThemeOption } from "@/lib/theme";
import { setLanguage, LangOption } from "@/lib/i18n";

export type EditorView = "edit" | "split" | "preview";

export const settings = reactive({
  loaded: false,
  workspace: null as string | null,
  imagesDir: "images",
  language: "system" as LangOption,
  theme: "system" as ThemeOption,
  /** Markdown 打开时默认进入的经典子视图（用户最近一次切换的 编辑/分屏/预览）。 */
  defaultView: "edit" as EditorView,
  /** Left tree hidden to maximize the editor area (persisted). */
  sidebarCollapsed: false,
  /** Auto-save edits to disk (persisted; default off, Ctrl+S always works). */
  autosave: false,
  /** 文本编辑器自动换行（编辑器顶栏切换，持久化；默认开启）。 */
  wordWrap: true,
});

export async function loadSettings(): Promise<void> {
  try {
    const cfg = await api.getConfig();
    settings.imagesDir = cfg.images_dir || "images";
    settings.language = (cfg.language as LangOption) || "system";
    settings.theme = (cfg.theme as ThemeOption) || "system";
    settings.defaultView = (cfg.editor_view as EditorView) || "edit";
    settings.sidebarCollapsed = !!cfg.sidebar_collapsed;
    settings.autosave = !!cfg.autosave;
    // 默认开启换行：旧配置文件没有该字段（false）时保持开启而不是关掉
    settings.wordWrap = cfg.word_wrap !== false;
  } catch {
    // Running outside Tauri (browser smoke test) — keep defaults.
  }
  // The workspace is intentionally NOT restored here: the welcome screen
  // shows the recent-workspaces list on startup instead.
  settings.loaded = true;
}

export async function persistSettings(): Promise<void> {
  const cfg: AppConfig = {
    images_dir: settings.imagesDir,
    language: settings.language,
    theme: settings.theme,
    editor_view: settings.defaultView,
    sidebar_collapsed: settings.sidebarCollapsed,
    autosave: settings.autosave,
    word_wrap: settings.wordWrap,
  };
  try {
    await api.saveConfig(cfg);
  } catch {
    // Ignore persistence failures outside Tauri.
  }
}

export async function toggleSidebar(): Promise<void> {
  settings.sidebarCollapsed = !settings.sidebarCollapsed;
  await persistSettings();
}

/** 编辑器顶栏的自动换行显示切换（写入配置持久化）。 */
export async function toggleWordWrap(): Promise<void> {
  settings.wordWrap = !settings.wordWrap;
  await persistSettings();
}

export async function updateTheme(pref: ThemeOption): Promise<void> {
  settings.theme = pref;
  applyTheme(pref);
  await persistSettings();
}

export async function updateLanguage(pref: LangOption): Promise<void> {
  settings.language = pref;
  await setLanguage(pref);
  await persistSettings();
}

export async function updateDefaultView(view: EditorView): Promise<void> {
  if (settings.defaultView === view) return;
  settings.defaultView = view;
  await persistSettings();
}

export async function updateImagesDir(dir: string): Promise<void> {
  const trimmed = dir.trim().replace(/[\\/]+$/, "");
  settings.imagesDir = trimmed || "images";
  await persistSettings();
}

export async function updateAutosave(on: boolean): Promise<void> {
  settings.autosave = on;
  await persistSettings();
}
