import { convertFileSrc, isTauri } from "./tauri";

/** Schemes the webview can load as-is (no local resolution needed). */
const EXTERNAL_SCHEME_RE = /^(https?|data|asset|blob|file):/i;

/** Tauri asset-protocol URLs (`http(s)://asset.localhost/...` on Windows). */
const ASSET_HTTP_RE = /^(https?):\/\/asset\.localhost\/(.+)$/i;
const ASSET_SCHEME_RE = /^asset:\/\/localhost\/(.*)$/i;

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Resolve an image reference found inside a note to an absolute path:
 * - absolute drive paths pass through unchanged;
 * - relative paths are resolved against the note's directory (`..` supported).
 * Returns null for web/data URLs — nothing to resolve locally.
 */
export function refToAbsPath(ref: string, notePath: string): string | null {
  const decoded = safeDecode(ref);
  if (EXTERNAL_SCHEME_RE.test(decoded)) return null;
  if (/^[a-zA-Z]:[\\/]/.test(decoded) || decoded.startsWith("/")) return decoded;

  const noteDir = notePath.replace(/[\\/][^\\/]+$/, "");
  const stack = noteDir.split(/[\\/]/).filter(Boolean);
  for (const part of decoded.split(/[\\/]/)) {
    if (!part || part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return stack.join("\\");
}

/** Make an absolute path relative to the note's directory when possible. */
export function absToRef(abs: string, notePath: string): string | null {
  const noteDir = notePath.replace(/[\\/][^\\/]+$/, "").replace(/[\\/]+$/, "");
  const lowerAbs = abs.toLowerCase();
  const lowerDir = noteDir.toLowerCase();
  if (lowerAbs === lowerDir) return null;
  const rest = lowerAbs.startsWith(lowerDir + "\\")
    ? abs.slice(noteDir.length + 1)
    : lowerAbs.startsWith(lowerDir + "/")
      ? abs.slice(noteDir.length + 1)
      : null;
  if (rest === null) return abs.replace(/\\/g, "/"); // outside the note dir: keep absolute
  return rest.replace(/\\/g, "/");
}

/** Webview-loadable URL for a local file (asset protocol inside Tauri). */
export function displayUrl(absPath: string): string {
  if (isTauri()) return convertFileSrc(absPath);
  return absPath;
}

const IMAGE_MD_RE = /(!\[[^\]]*\]\()(\s*)(<[^>]*>|[^)\n]+?)(\s*\))/g;

/** Markdown 里内嵌的 HTML `<img src="…">`（引号风格各有不同）。 */
const IMG_HTML_RE = /(<img\b[^>]*?\bsrc=)(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))([^>]*>)/gi;

/**
 * Rewrite the `src` of every HTML `<img>` in the markdown text via `map`:
 * return the replacement value, or null to keep the original untouched.
 */
function rewriteHtmlImg(
  md: string,
  map: (src: string) => string | null
): string {
  return md.replace(
    IMG_HTML_RE,
    (
      whole: string,
      lead: string,
      dq: string | undefined,
      sq: string | undefined,
      uq: string | undefined,
      tail: string | undefined
    ) => {
      const src = dq ?? sq ?? uq ?? "";
      if (!src || tail === undefined) return whole;
      const next = map(src);
      if (!next || next === src) return whole;
      if (dq !== undefined) return `${lead}"${next}"${tail}`;
      if (sq !== undefined) return `${lead}'${next}'${tail}`;
      return `${lead}${next}${tail}`;
    }
  );
}

/** Absolute local path for a Tauri asset URL; null for non-asset sources. */
export function assetUrlToAbsPath(url: string): string | null {
  const http = ASSET_HTTP_RE.exec(url);
  const scheme = http ? null : ASSET_SCHEME_RE.exec(url);
  if (!http && !scheme) return null;
  const abs = safeDecode((http ? http[2] : scheme![1]).replace(/\/+$/, ""));
  return abs || null;
}

/**
 * Rewrite image refs in markdown source to webview-loadable URLs. Used when
 * feeding the WYSIWYG editor (vditor), which renders `src` attributes
 * directly and cannot resolve note-relative paths on its own. Covers both
 * `![](...)` refs and HTML `<img src="…">` tags embedded in the markdown.
 */
export function markdownToDisplay(md: string, notePath: string): string {
  if (!isTauri() || !notePath) return md;
  const mdImages = md.replace(IMAGE_MD_RE, (whole, lead: string, _ws: string, dest: string, tail: string) => {
    let inner = dest;
    if (inner.startsWith("<") && inner.endsWith(">")) inner = inner.slice(1, -1);
    // Skip titles/spaced dests — only plain paths are safe to rewrite.
    if (/[\s"]/.test(inner)) return whole;
    const abs = refToAbsPath(inner, notePath);
    if (!abs) return whole;
    return `${lead}${displayUrl(abs)}${tail}`;
  });
  return rewriteHtmlImg(mdImages, (src) => {
    const abs = refToAbsPath(src, notePath);
    return abs ? displayUrl(abs) : null;
  });
}

/**
 * Rewrite asset-protocol image refs back to portable (relative) paths.
 * The inverse of {@link markdownToDisplay}; runs before persisting content
 * read back from the WYSIWYG editor. Covers `![](...)` refs and HTML
 * `<img src="…">` tags alike so embedded-HTML images never leak asset URLs
 * into the saved file.
 */
export function markdownToSource(md: string, notePath: string): string {
  if (!notePath) return md;
  const mdImages = md.replace(IMAGE_MD_RE, (whole, lead: string, _ws: string, dest: string, tail: string) => {
    const http = ASSET_HTTP_RE.exec(dest);
    const scheme = http ? null : ASSET_SCHEME_RE.exec(dest);
    if (!http && !scheme) return whole;
    const abs = safeDecode((http ? http[2] : scheme![1]).replace(/\/+$/, ""));
    if (!abs) return whole;
    const rel = absToRef(abs, notePath);
    if (rel === null) return whole;
    return `${lead}${rel}${tail}`;
  });
  return rewriteHtmlImg(mdImages, (src) => {
    const http = ASSET_HTTP_RE.exec(src);
    const scheme = http ? null : ASSET_SCHEME_RE.exec(src);
    if (!http && !scheme) return null;
    const abs = safeDecode((http ? http[2] : scheme![1]).replace(/\/+$/, ""));
    if (!abs) return null;
    const rel = absToRef(abs, notePath);
    return rel === null ? null : rel;
  });
}
