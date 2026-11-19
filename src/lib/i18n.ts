import { reactive } from "vue";

export type LangOption = "system" | "zh-CN" | "en-US";

interface Bundle {
  [key: string]: any;
}

const bundles: Record<string, Bundle> = {};

export const i18n = reactive({
  locale: "zh-CN",
  messages: {} as Bundle,
});

export function detectSystemLocale(): string {
  const lang = (navigator.language || "en").toLowerCase();
  return lang.startsWith("zh") ? "zh-CN" : "en-US";
}

async function loadBundle(locale: string): Promise<Bundle> {
  if (bundles[locale]) return bundles[locale];
  const resp = await fetch(`/locales/${locale}.json`);
  if (!resp.ok) throw new Error(`locale ${locale} not found`);
  const json = (await resp.json()) as Bundle;
  bundles[locale] = json;
  return json;
}

/**
 * Resolve the UI language. Preference order:
 * user setting -> system language -> built-in zh-CN fallback.
 */
export async function setLanguage(pref: LangOption): Promise<void> {
  const target = pref === "system" ? detectSystemLocale() : pref;
  let messages: Bundle | null = null;
  try {
    messages = await loadBundle(target);
  } catch {
    messages = null;
  }
  if (messages) {
    i18n.locale = target;
    i18n.messages = messages;
    return;
  }
  try {
    i18n.messages = await loadBundle("zh-CN");
  } catch {
    i18n.messages = {};
  }
  i18n.locale = "zh-CN";
}

/** Translate a dot-separated key, with optional {name} interpolation. */
export function t(key: string, params?: Record<string, string | number>): string {
  let value = lookup(i18n.messages, key);
  if (value === undefined) value = lookup(bundles["zh-CN"], key);
  if (typeof value !== "string") return key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      value = value.replaceAll(`{${k}}`, String(v));
    }
  }
  return value;
}

function lookup(bundle: Bundle | undefined, key: string): string | undefined {
  if (!bundle) return undefined;
  let node: any = bundle;
  for (const part of key.split(".")) {
    if (node == null) return undefined;
    node = node[part];
  }
  return typeof node === "string" ? node : undefined;
}
