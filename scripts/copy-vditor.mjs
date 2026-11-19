// Copy vditor's dist assets into public/ so the app can load them fully
// offline (vditor lazily fetches js/css from its `cdn` option at runtime).
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(root, "node_modules", "vditor", "dist");
// vditor builds asset URLs as `${cdn}/dist/...`, so keep the dist segment.
const dest = join(root, "public", "vditor", "dist");

if (!existsSync(src)) {
  console.warn(`[copy-vditor] ${src} not found, skipping (install dependencies first)`);
  process.exit(0);
}

mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log("[copy-vditor] copied vditor dist -> public/vditor");
