import { reactive } from "vue";
import { assetUrlToAbsPath } from "@/lib/imgSrc";
import { baseName } from "@/lib/tauri";

export interface PreviewImage {
  /** Loadable URL for the overlay <img>. */
  url: string;
  /** Local absolute path when the image lives on disk (null for remote URLs). */
  absPath: string | null;
  /** Basename used as the default save-as name. */
  name: string;
}

export const imgPreview = reactive({
  open: false,
  images: [] as PreviewImage[],
  index: 0,
  zoom: 1,
  /** Clockwise degrees (negative = counterclockwise). */
  rotation: 0,
  tx: 0,
  ty: 0,
});

export const ZOOM_MIN = 0.2;
export const ZOOM_MAX = 8;

export function currentImage(): PreviewImage | null {
  return imgPreview.images[imgPreview.index] ?? null;
}

function resetTransform(): void {
  imgPreview.zoom = 1;
  imgPreview.rotation = 0;
  imgPreview.tx = 0;
  imgPreview.ty = 0;
}

export function openImagePreview(images: PreviewImage[], index: number): void {
  if (!images.length) return;
  imgPreview.images = images;
  imgPreview.index = Math.min(Math.max(index, 0), images.length - 1);
  resetTransform();
  imgPreview.open = true;
}

/**
 * Gather every <img> of `container` and open the preview focused on `target`.
 * Returns false when the click was not on an image of this container.
 */
export function openFromContainer(container: HTMLElement, target: Element): boolean {
  const imgs = [...container.querySelectorAll("img")];
  const idx = imgs.indexOf(target as HTMLImageElement);
  if (idx === -1 || !imgs.length) return false;
  const images = imgs.map((img) => {
    const raw = img.getAttribute("src") ?? "";
    const url = img.currentSrc || img.src || raw;
    const absPath = assetUrlToAbsPath(raw);
    let name = absPath ? baseName(absPath) : "";
    if (!name) {
      try {
        name = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() ?? "");
      } catch {
        /* keep empty */
      }
    }
    return { url, absPath, name: name || "image" };
  });
  openImagePreview(images, idx);
  return true;
}

export function closeImagePreview(): void {
  imgPreview.open = false;
}

export function stepPreview(delta: number): void {
  const len = imgPreview.images.length;
  if (!len) return;
  imgPreview.index = (imgPreview.index + delta + len) % len;
  resetTransform();
}

export function zoomPreview(factor: number): void {
  const next = imgPreview.zoom * factor;
  imgPreview.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
}

export function rotatePreview(): void {
  imgPreview.rotation -= 90;
}

export function resetPreview(): void {
  resetTransform();
}
