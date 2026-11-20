// Tree → editor drag-and-drop protocol: tree rows put a JSON payload in a
// custom MIME type (plus a text/plain fallback), the editor's drop handler
// converts it into a note-relative image/link reference.

import { absToRef } from "./imgSrc";
import { isImagePath, baseName } from "./tauri";

export const TREE_FILE_TYPE = "application/x-hinote-tree-file";

export interface TreeFileInfo {
  path: string;
  name: string;
  isImage: boolean;
}

/** Build the drag payload for a tree file row. */
export function setTreeFileData(dt: DataTransfer, path: string, name: string): void {
  dt.effectAllowed = "copy";
  dt.setData(
    TREE_FILE_TYPE,
    JSON.stringify({ path, name, isImage: isImagePath(path) } satisfies TreeFileInfo)
  );
  dt.setData("text/plain", path);
}

/** True when the drag carries a tree file payload (types check works in dragover). */
export function hasTreeFileData(dt: DataTransfer | null): boolean {
  return !!dt && Array.from(dt.types).includes(TREE_FILE_TYPE);
}

/** Parse the payload; null when absent or malformed. */
export function readTreeFileData(dt: DataTransfer | null): TreeFileInfo | null {
  if (!dt) return null;
  const raw = dt.getData(TREE_FILE_TYPE);
  if (!raw) return null;
  try {
    const info = JSON.parse(raw) as TreeFileInfo;
    return info && typeof info.path === "string" ? info : null;
  } catch {
    return null;
  }
}

/**
 * Markdown reference to insert for a dragged tree file: images become
 * `![](rel)`, everything else `[name](rel)` — path relative to the note
 * (forward slashes, falls back to absolute outside the note dir).
 */
export function refForTreeFile(info: TreeFileInfo, notePath: string): string {
  const rel = (notePath && absToRef(info.path, notePath)) || info.path.replace(/\\/g, "/");
  const name = info.name || baseName(info.path);
  return info.isImage ? `![](${rel})` : `[${name}](${rel})`;
}
