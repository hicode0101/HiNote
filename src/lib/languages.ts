// 文件类型 / 语言注册表（对应 HiEditor 的语言插件集合）：树图标、编辑器
// 语法高亮、状态栏语言名共用这一份映射。

export type LangId =
  | "md" | "txt" | "json" | "xml" | "pdf" | "image"
  | "html" | "css" | "javascript" | "typescript" | "python" | "java"
  | "csharp" | "cpp" | "go" | "rust" | "sql" | "php" | "yaml" | "shell"
  | "ini" | "batch";

interface LangDecl {
  id: LangId;
  /** i18n key under `lang.*` for known languages; otherwise shown as-is. */
  extensions: string[];
}

const LANGS: LangDecl[] = [
  { id: "md", extensions: [".md", ".markdown", ".mdown", ".mkd"] },
  { id: "txt", extensions: [".txt", ".log"] },
  { id: "pdf", extensions: [".pdf"] },
  { id: "json", extensions: [".json", ".jsonc"] },
  { id: "xml", extensions: [".xml", ".xsl", ".xslt", ".csproj", ".vbproj", ".props", ".targets", ".resx", ".plist"] },
  { id: "html", extensions: [".html", ".htm"] },
  { id: "css", extensions: [".css"] },
  { id: "javascript", extensions: [".js", ".mjs", ".cjs", ".jsx"] },
  { id: "typescript", extensions: [".ts", ".tsx", ".mts", ".cts"] },
  { id: "python", extensions: [".py", ".pyw"] },
  { id: "java", extensions: [".java"] },
  { id: "csharp", extensions: [".cs"] },
  { id: "cpp", extensions: [".c", ".h", ".cpp", ".hpp", ".cc", ".cxx"] },
  { id: "go", extensions: [".go"] },
  { id: "rust", extensions: [".rs"] },
  { id: "sql", extensions: [".sql"] },
  { id: "php", extensions: [".php", ".phtml"] },
  { id: "yaml", extensions: [".yml", ".yaml"] },
  { id: "shell", extensions: [".sh", ".bash", ".zsh"] },
  { id: "ini", extensions: [".ini", ".toml", ".cfg", ".conf"] },
  { id: "batch", extensions: [".bat", ".cmd"] },
];

const EXT_TO_LANG = new Map<string, LangId>();
for (const lang of LANGS) {
  for (const ext of lang.extensions) {
    EXT_TO_LANG.set(ext, lang.id);
  }
}

/** Extension → language id (lowercased lookup); null when unknown. */
export function langForPath(path: string | null | undefined): LangId | null {
  if (!path) return null;
  const dot = path.lastIndexOf(".");
  if (dot < 0) return null;
  const ext = path.slice(dot).toLowerCase();
  // images keep their own icon/preview path
  const hit = EXT_TO_LANG.get(ext);
  return hit ?? null;
}

const ICON_OVERRIDES: Partial<Record<LangId, string>> = {
  md: "document",
  txt: "note",
  pdf: "pdf",
  image: "image",
};

/** Tree/toolbar icon name for a file-type id. */
export function langIcon(id: LangId | null): string {
  if (!id) return "document";
  return ICON_OVERRIDES[id] ?? "code";
}

/** CSS modifier class coloring the tree icon per file type. */
export function langColorClass(id: LangId | null): string {
  if (!id) return "";
  if (id === "md") return "type-md";
  if (id === "txt") return "type-txt";
  if (id === "pdf") return "type-pdf";
  if (id === "image") return "type-image";
  return "type-code";
}
