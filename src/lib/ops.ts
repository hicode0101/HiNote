import { t } from "./i18n";
import { api, joinPath } from "./tauri";
import { promptDialog, confirmDialog } from "@/stores/dialog";
import {
  refreshTree,
  expandPath,
  activateFile,
  removeOpenStateIfDeleted,
} from "@/stores/workspace";
import { editor } from "@/stores/editor";
import { settings, updateImagesDir } from "@/stores/settings";
import { insertAtCursor } from "./markdownActions";

export interface NodeRef {
  name: string;
  path: string;
  kind: "dir" | "file";
}

function dirName(p: string): string {
  const idx = Math.max(p.lastIndexOf("\\"), p.lastIndexOf("/"));
  return idx > 0 ? p.slice(0, idx) : p;
}

function stripMdExt(name: string): string {
  return name.replace(/\.(md|markdown)$/i, "");
}

function ensureMdExt(name: string): string {
  return /\.(md|markdown)$/i.test(name) ? name : `${name}.md`;
}

function ensureTxtExt(name: string): string {
  return /\.txt$/i.test(name) ? name : `${name}.txt`;
}

async function uniqueTarget(dir: string, name: string): Promise<string> {
  const candidate = joinPath(dir, name);
  if (!(await api.pathExists(candidate))) return candidate;
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let n = 2; n < 1000; n++) {
    const next = joinPath(dir, `${stem} ${n}${ext}`);
    if (!(await api.pathExists(next))) return next;
  }
  throw new Error("name_exhausted");
}

export type NewFileKind = "md" | "txt";

/** Create a new file from the tree menu: markdown note or plain text. */
export async function createDocument(parentDir: string, kind: NewFileKind = "md"): Promise<void> {
  const isMd = kind === "md";
  const name = await promptDialog({
    title: isMd ? t("dialog.newDocTitle") : t("dialog.newTextTitle"),
    value: isMd ? t("editor.newDoc") : t("editor.newText"),
    placeholder: t("dialog.namePlaceholder"),
    okText: t("dialog.ok"),
    cancelText: t("dialog.cancel"),
  });
  if (name === null) return;
  const trimmed = name.trim();
  if (!trimmed) return;
  const fileName = isMd ? ensureMdExt(trimmed) : ensureTxtExt(trimmed);
  const target = await uniqueTarget(parentDir, fileName);
  try {
    await api.createFile(target, isMd ? `# ${stripMdExt(fileName)}\n` : "");
    await refreshTree();
    expandPath(parentDir);
    await activateFile(target);
  } catch (e) {
    console.error("createDocument failed", e);
  }
}

export async function createFolder(parentDir: string): Promise<void> {
  const name = await promptDialog({
    title: t("dialog.newFolderTitle"),
    placeholder: t("dialog.namePlaceholder"),
    okText: t("dialog.ok"),
    cancelText: t("dialog.cancel"),
  });
  if (name === null) return;
  const trimmed = name.trim();
  if (!trimmed) return;
  const target = await uniqueTarget(parentDir, trimmed);
  try {
    await api.createDir(target);
    await refreshTree();
    expandPath(parentDir);
  } catch (e) {
    console.error("createFolder failed", e);
  }
}

export async function renameNode(node: NodeRef): Promise<void> {
  // Files: full name including extension, so the suffix is editable too.
  // Dirs: name as-is.
  const name = await promptDialog({
    title: t("dialog.renameTitle"),
    value: node.name,
    placeholder: t("dialog.namePlaceholder"),
    okText: t("dialog.ok"),
    cancelText: t("dialog.cancel"),
  });
  if (name === null) return;
  const trimmed = name.trim();
  if (!trimmed) return;
  if (trimmed === node.name) return;
  const target = joinPath(dirName(node.path), trimmed);
  try {
    await api.renamePath(node.path, target);
    await refreshTree();
    if (editor.path && editor.path.toLowerCase() === node.path.toLowerCase()) {
      editor.path = target;
      api.setWatchedFile(target).catch(() => {}); // keep external-change watch on the new path
    }
  } catch (e) {
    console.error("renameNode failed", e);
  }
}

export async function deleteNode(node: NodeRef): Promise<void> {
  const message =
    node.kind === "dir"
      ? t("dialog.deleteFolderMsg", { name: node.name })
      : t("dialog.deleteDocMsg", { name: node.name });
  const result = await confirmDialog({
    title: t("dialog.deleteTitle"),
    message,
    okText: t("dialog.ok"),
    cancelText: t("dialog.cancel"),
    danger: true,
  });
  if (result !== true) return;
  try {
    await api.deletePath(node.path);
    if (editor.path && editor.path.toLowerCase().startsWith(node.path.toLowerCase())) {
      removeOpenStateIfDeleted(editor.path);
    }
    await refreshTree();
  } catch (e) {
    console.error("deleteNode failed", e);
  }
}

export function revealNode(node: NodeRef | null): void {
  const target = node?.path ?? settings.workspace;
  if (!target) return;
  void api.revealInExplorer(target).catch(() => undefined);
}

/** Pick an image file, copy it into the images dir, insert the markdown. */
export async function pickAndInsertImage(): Promise<void> {
  if (!editor.path) return;
  const picked = await api.pickImageFile();
  if (!picked) return;
  const ext = (picked.split(".").pop() || "png").toLowerCase();
  const rel = await api.savePasteImage(editor.path, ext, undefined, picked);
  insertAtCursor(`![](${rel})`);
}

export { updateImagesDir };
