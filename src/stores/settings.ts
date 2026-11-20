import { reactive } from "vue";
import { api, AppConfig } from "@/lib/tauri";
import { applyTheme, ThemeOption } from "@/lib/theme";
import { setLanguage, LangOption } from "@/lib/i18n";

export type EditorMode = "classic" | "fluid";

export const settings = reactive({
  loaded: false,
  workspace: null as string | null,
  imagesDir: "images",
  language: "system" as LangOption,
  theme: "system" as ThemeOption,
  editorMode: "classic" as EditorMode,
  /** Left tree hidden to maximize the editor area (persisted). */
  sidebarCollapsed: false,
  /** Auto-save edits to disk (persisted; default off, Ctrl+S always works). */
  autosave: false,
});

export async function loadSettings(): Promise<void> {
  try {
    const cfg = await api.getConfig();
    settings.imagesDir = cfg.images_dir || "images";
    settings.language = (cfg.language as LangOption) || "system";
    settings.theme = (cfg.theme as ThemeOption) || "system";
    settings.editorMode = (cfg.editor_mode as EditorMode) || "classic";
    settings.sidebarCollapsed = !!cfg.sidebar_collapsed;
    settings.autosave = !!cfg.autosave;
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
    editor_mode: settings.editorMode,
    sidebar_collapsed: settings.sidebarCollapsed,
    autosave: settings.autosave,
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

export async function updateEditorMode(mode: EditorMode): Promise<void> {
  if (settings.editorMode === mode) return;
  settings.editorMode = mode;
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
