// ===== 行尾符（EOL）边界处理 =====
// CodeMirror 6 的 doc.toString() 固定用 "\n" 连接各行（DefaultSplit 会把
// \r\n / \r 拆成行，该行为无法配置），CRLF 文件若原样进入编辑器，打开瞬间
// 就会「内容不一致 → 变脏 → 自动保存重写行尾」。因此约定：编辑器内部
// （editor.content / CM doc）恒为 \n 归一化文本，磁盘真实行尾单独记录，
// 写盘前还原 —— 保证「打开后不做任何修改」不会产生任何磁盘写入。

/** 文件行尾类型。 */
export type Eol = "\n" | "\r\n";

/**
 * 检测文本的主导行尾：\r\n 行数多于孤立 \n 行数则视为 CRLF 文件。
 * 空文本 / 纯 LF 视为 LF；孤立 \r（旧 Mac）无实际意义，按 LF 处理。
 */
export function detectEol(text: string): Eol {
  const crlf = countOccurrences(text, "\r\n");
  const loneLf = countOccurrences(text, "\n") - crlf;
  return crlf > loneLf ? "\r\n" : "\n";
}

/** 磁盘文本 → 编辑器内部文本（\r\n / 孤立 \r 一律归一化为 \n）。 */
export function toEditorText(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

/** 编辑器内部文本 → 磁盘文本（按打开时检测到的行尾还原）。 */
export function toDiskText(content: string, eol: Eol): string {
  return eol === "\r\n" ? content.replace(/\n/g, "\r\n") : content;
}

function countOccurrences(text: string, needle: string): number {
  if (!needle) return 0;
  let n = 0;
  for (let i = 0; (i = text.indexOf(needle, i)) !== -1; i += needle.length) n++;
  return n;
}
