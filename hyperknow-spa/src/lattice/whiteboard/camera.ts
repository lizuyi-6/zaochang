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

export interface ViewportInsets {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}

export const CAMERA_ZOOM_MIN = 0.5;
export const CAMERA_ZOOM_MAX = 2.5;
export const CAMERA_ZOOM_STEPS = [0.75, 1, 1.15, 1.3, 1.56, 2.0];

export function clampZoom(z: number, min = CAMERA_ZOOM_MIN, max = CAMERA_ZOOM_MAX): number {
  if (isNaN(z) || !isFinite(z)) return 1;
  return Math.min(Math.max(z, min), max);
}

/** 自动取景的可读下限:板书正文 19px,低于 0.5 倍就不足 10px。横屏手机可视高度只剩
 * ~200px,旧逻辑把整块内容硬塞进去会缩到 20%,学员看到的是一团小黑点。到下限后
 * 不再缩小,改为从内容起点(左上)显示,其余由镜头跟随/手动拖动查看。 */
export const CAMERA_READABLE_MIN_ZOOM = 0.5;

/** 留白随可视区收缩:固定 48px 在 200px 高的横屏可视区里要吃掉近一半 */
function effectivePadding(padding: number, safeWidth: number, safeHeight: number): number {
  return Math.min(padding, safeWidth * 0.08, safeHeight * 0.08);
}

export function calculateFocusZoom(
  box: BoundingBox,
  safeWidth: number,
  safeHeight: number,
  padding = 48,
  maxAutoZoom = 1.35,
): number {
  const pad = effectivePadding(padding, safeWidth, safeHeight);
  const availW = Math.max(safeWidth - pad * 2, 80);
  const availH = Math.max(safeHeight - pad * 2, 80);
  const fitZoom = Math.min(availW / Math.max(box.width, 1), availH / Math.max(box.height, 1));
  const sensibleFit = fitZoom * 0.92;
  const zoom = Math.max(Math.min(sensibleFit, maxAutoZoom), Math.min(CAMERA_READABLE_MIN_ZOOM, maxAutoZoom));
  return clampZoom(zoom, Math.min(CAMERA_READABLE_MIN_ZOOM, zoom));
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
  currentZoom = 1,
  padding = 48,
  insets?: ViewportInsets,
  autoZoom = true,
): CameraState {
  const top = Math.max(0, insets?.top ?? 0);
  const bottom = Math.max(0, insets?.bottom ?? 0);
  const left = Math.max(0, insets?.left ?? 0);
  const right = Math.max(0, insets?.right ?? 0);

  const vw = Math.max(viewport.width, 200);
  const vh = Math.max(viewport.height, 200);
  const safeW = Math.max(vw - left - right, 100);
  const safeH = Math.max(vh - top - bottom, 100);
  const safeCenterX = left + safeW / 2;
  const safeCenterY = top + safeH / 2;

  const boxCenterX = box.minX + box.width / 2;
  const boxCenterY = box.minY + box.height / 2;

  let targetZoom: number;
  if (autoZoom) {
    targetZoom = calculateFocusZoom(box, safeW, safeH, padding);
  } else {
    const availW = Math.max(safeW - padding * 2, 80);
    const availH = Math.max(safeH - padding * 2, 80);
    const maxFitZoom = Math.min(availW / Math.max(box.width, 1), availH / Math.max(box.height, 1));
    targetZoom = clampZoom(Math.min(currentZoom, maxFitZoom));
  }

  /* 放得下就居中;放不下(已到可读下限)就让内容起点贴住安全区左上——板书自上而下、
   * 自左而右书写,先看到开头才跟得上讲解 */
  const pad = effectivePadding(padding, safeW, safeH);
  const fitsX = box.width * targetZoom <= safeW - pad * 2;
  const fitsY = box.height * targetZoom <= safeH - pad * 2;
  return {
    x: fitsX ? safeCenterX - boxCenterX * targetZoom : left + pad - box.minX * targetZoom,
    y: fitsY ? safeCenterY - boxCenterY * targetZoom : top + pad - box.minY * targetZoom,
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
