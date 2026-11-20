// JSON / XML 格式化与压缩（对应 HiEditor 的 json/xml 插件命令）：
// 经典模式下整篇替换，保留撤销栈；结果/错误经右下角 Toast 反馈。

import { api } from "./tauri";
import { editor } from "@/stores/editor";
import { langForPath } from "./languages";
import { replaceAllText } from "./markdownActions";
import { showToast } from "@/stores/ui";
import { t } from "./i18n";

/** Current file is formattable (json/xml) and the classic editor is live. */
export function canFormat(): boolean {
  const lang = langForPath(editor.path);
  return lang === "json" || lang === "xml";
}

/**
 * Run a formatter over the current document.
 * `minify=false` → pretty (indent 4), `minify=true` → compact single line.
 */
export async function formatDocument(minify: boolean): Promise<void> {
  const lang = langForPath(editor.path);
  if (lang !== "json" && lang !== "xml") return;
  const id = `${lang}.${minify ? "minify" : "pretty"}`;
  try {
    const out = await api.formatText(editor.content, id, 4);
    if (out !== editor.content) {
      replaceAllText(out);
    }
    showToast(t(minify ? "format.minified" : "format.formatted"));
  } catch (e) {
    showToast(String(e), 4000);
  }
}
