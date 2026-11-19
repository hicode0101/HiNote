import { createApp } from "vue";
import App from "./App.vue";
import { loadSettings, settings } from "./stores/settings";
import { applyTheme } from "./lib/theme";
import { setLanguage } from "./lib/i18n";
import { loadRecents } from "./stores/workspace";
import "./styles/global.css";

async function bootstrap(): Promise<void> {
  await loadSettings();
  applyTheme(settings.theme);
  await setLanguage(settings.language);
  await loadRecents();
  createApp(App).mount("#app");
}

void bootstrap();
