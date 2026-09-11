export interface Point2D {
  x: number;
  y: number;
}

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export const CAMERA_ZOOM_MIN = 0.5;
export const CAMERA_ZOOM_MAX = 2.5;
export const CAMERA_ZOOM_STEPS = [0.75, 1, 1.15, 1.3, 1.56, 2.0];

export function clampZoom(z: number, min = CAMERA_ZOOM_MIN, max = CAMERA_ZOOM_MAX): number {
  if (isNaN(z) || !isFinite(z)) return 1;
  return Math.min(Math.max(z, min), max);
}

export function zoomAtPoint(
  camera: CameraState,
  focal: Point2D,
  newZoom: number,
): CameraState {
  const z = clampZoom(newZoom);
  const worldX = (focal.x - camera.x) / camera.zoom;
  const worldY = (focal.y - camera.y) / camera.zoom;
  return {
    x: focal.x - worldX * z,
    y: focal.y - worldY * z,
    zoom: z,
  };
}

export function focusBox(
  box: BoundingBox,
  viewport: { width: number; height: number },
  currentZoom: number,
  padding = 60,
): CameraState {
  const vw = Math.max(viewport.width, 200);
  const vh = Math.max(viewport.height, 200);
  const boxCenterX = box.minX + box.width / 2;
  const boxCenterY = box.minY + box.height / 2;

  const availW = Math.max(vw - padding * 2, 100);
  const availH = Math.max(vh - padding * 2, 100);
  const maxFitZoom = Math.min(availW / Math.max(box.width, 1), availH / Math.max(box.height, 1));
  const targetZoom = clampZoom(Math.min(currentZoom, maxFitZoom));

  return {
    x: vw / 2 - boxCenterX * targetZoom,
    y: vh / 2 - boxCenterY * targetZoom,
    zoom: targetZoom,
  };
}

export function computeBoundingBox(
  elements: Array<{ x: number; y: number; width?: number; height?: number }>,
): BoundingBox | null {
  if (!elements || elements.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const el of elements) {
    const w = el.width ?? 320;
    const h = el.height ?? 60;
    if (el.x < minX) minX = el.x;
    if (el.y < minY) minY = el.y;
    if (el.x + w > maxX) maxX = el.x + w;
    if (el.y + h > maxY) maxY = el.y + h;
  }

  if (!isFinite(minX) || !isFinite(minY)) return null;

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}
