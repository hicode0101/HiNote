import { ref } from "vue";

export type ThemeOption = "system" | "light" | "dark";

export const resolvedTheme = ref<"light" | "dark">("light");

let currentPref: ThemeOption = "system";
let mediaQuery: MediaQueryList | null = null;

function systemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function resolveAndApply(): void {
  resolvedTheme.value = currentPref === "system" ? systemTheme() : currentPref;
  document.documentElement.dataset.theme = resolvedTheme.value;
}

/** Apply the theme preference; `system` tracks the OS setting live. */
export function applyTheme(pref: ThemeOption): void {
  currentPref = pref;
  if (!mediaQuery) {
    mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener("change", () => {
      if (currentPref === "system") resolveAndApply();
    });
  }
  resolveAndApply();
}
