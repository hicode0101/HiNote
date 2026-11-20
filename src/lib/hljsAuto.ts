import hljs from "highlight.js";

// Common languages for auto-detection (bare ``` fences and inline code).
export const AUTO_LANGS = [
  "javascript", "typescript", "python", "rust", "go", "java", "c", "cpp",
  "csharp", "bash", "shell", "json", "yaml", "xml", "html", "css", "sql",
  "ini", "toml", "php", "ruby", "markdown",
];

/**
 * Highlight `str` with language auto-detection. Returns highlighted HTML,
 * or null when the text doesn't look like code (plain prose yields no
 * meaningful tokens).
 *
 * `minSpans` guards against single-token false positives: prose like
 * "just some words here" can trip one SQL keyword match, so inline snippets
 * pass 2 while multi-line fences pass the default 1.
 */
export function hlAuto(str: string, minSpans = 1): string | null {
  if (!str.trim()) return null;
  const res = hljs.highlightAuto(str, AUTO_LANGS);
  if (res.relevance < 1) return null;
  const spans = res.value.split("<span").length - 1;
  if (spans < minSpans) return null;
  return res.value;
}
