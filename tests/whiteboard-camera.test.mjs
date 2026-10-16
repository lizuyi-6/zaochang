import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampZoom,
  zoomAtPoint,
  focusBox,
  computeBoundingBox,
  calculateFocusZoom,
  CAMERA_READABLE_MIN_ZOOM,
} from '../hyperknow-spa/src/lattice/whiteboard/camera.ts';

test('camera zoom preserves the world point under the gesture anchor', () => {
  const camera = { x: -240, y: 90, zoom: 0.8 };
  const anchor = { x: 310, y: 190 };
  const next = zoomAtPoint(camera, anchor, 1.6);
  assert.equal((anchor.x - camera.x) / camera.zoom, (anchor.x - next.x) / next.zoom);
  assert.equal((anchor.y - camera.y) / camera.zoom, (anchor.y - next.y) / next.zoom);
});

test('camera clamps invalid and extreme zoom inputs', () => {
  assert.equal(clampZoom(NaN), 1);
  assert.equal(clampZoom(Infinity), 1);
  assert.ok(clampZoom(-2) > 0);
  assert.ok(clampZoom(100) <= 3);
});

test('camera bounds cover distant board items and preserve negative coordinates', () => {
  assert.equal(computeBoundingBox([]), null);
  assert.deepEqual(computeBoundingBox([
    { x: -100, y: 50, width: 300, height: 90 },
    { x: 600, y: 700, width: 400, height: 250 },
  ]), { minX: -100, minY: 50, maxX: 1000, maxY: 950, width: 1100, height: 900 });
});

test('mobile auto focus fits real board items above a multiline caption dock', () => {
  // 真实板书元素:单栏卡片 320 宽、栏高上限内;续排跨两栏的一步约 680 宽
  for (const size of [{ width: 320, height: 420 }, { width: 360, height: 300 }]) {
    const box = computeBoundingBox([{ x: 900, y: 800, ...size }]);
    const camera = focusBox(box, { width: 390, height: 844 }, 1, 24,
      { top: 170, bottom: 200, left: 8, right: 8 });
    assert.ok(camera.zoom < 1.05);
    assert.ok(camera.zoom >= CAMERA_READABLE_MIN_ZOOM);
    assert.ok(box.minX * camera.zoom + camera.x >= 8);
    assert.ok(box.maxX * camera.zoom + camera.x <= 382);
    assert.ok(box.minY * camera.zoom + camera.y >= 170);
    assert.ok(box.maxY * camera.zoom + camera.y <= 644);
  }
});

test('oversized content never shrinks below the readable floor; it starts from its top-left instead (landscape phone)', () => {
  // 2026-10-16 实测:横屏手机 844×390,一张 470 高的卡片被缩到 20%,字成一团小黑点
  const insets = { top: 110, bottom: 84, left: 8, right: 8 };
  const viewport = { width: 844, height: 390 };
  for (const size of [{ width: 320, height: 470 }, { width: 900, height: 300 }, { width: 500, height: 1400 }]) {
    const box = computeBoundingBox([{ x: 420, y: 94, ...size }]);
    const camera = focusBox(box, viewport, 1, 48, insets, true);
    assert.ok(camera.zoom >= CAMERA_READABLE_MIN_ZOOM, `zoom ${camera.zoom} 低于可读下限`);
    // 起点可见:内容左上角落在安全区内(不被顶栏/左缘遮挡)
    const left = box.minX * camera.zoom + camera.x;
    const top = box.minY * camera.zoom + camera.y;
    assert.ok(left >= insets.left && left < viewport.width - insets.right, `内容左缘不可见: ${left}`);
    assert.ok(top >= insets.top && top < viewport.height - insets.bottom, `内容顶部不可见: ${top}`);
  }
});

test('camera focus fits a lesson item inside a tablet canvas', () => {
  const box = computeBoundingBox([{ x: 900, y: 800, width: 400, height: 300 }]);
  const viewport = { width: 680, height: 480 };
  const camera = focusBox(box, viewport, 1, 40);
  assert.ok(box.minX * camera.zoom + camera.x >= 0);
  assert.ok(box.minY * camera.zoom + camera.y >= 0);
  assert.ok(box.maxX * camera.zoom + camera.x <= viewport.width);
  assert.ok(box.maxY * camera.zoom + camera.y <= viewport.height);
});

test('calculateFocusZoom calculates sensible bounded zoom for cards and diagrams', () => {
  // Small card: should not over-zoom to giant sizes; caps at maxAutoZoom (1.35)
  const smallBox = { minX: 40, minY: 94, maxX: 380, maxY: 180, width: 340, height: 86 };
  const zoomSmall = calculateFocusZoom(smallBox, 1200, 700, 48);
  assert.ok(zoomSmall <= 1.35, `zoomSmall ${zoomSmall} should be <= 1.35`);
  assert.ok(zoomSmall >= 1.0, `zoomSmall ${zoomSmall} should be >= 1.0`);

  // Large diagram: fits comfortably within available dimensions
  const largeBox = { minX: 100, minY: 100, maxX: 900, maxY: 700, width: 800, height: 600 };
  const zoomLarge = calculateFocusZoom(largeBox, 1000, 700, 48);
  assert.ok(zoomLarge <= 1.0, `zoomLarge ${zoomLarge} should be <= 1.0`);
  assert.ok(zoomLarge > 0);
  assert.ok(largeBox.width * zoomLarge <= 1000 - 96);
  assert.ok(largeBox.height * zoomLarge <= 700 - 96);
});

test('focusBox with ViewportInsets offsets camera center away from top chrome and bottom dock', () => {
  const box = { minX: 40, minY: 90, maxX: 440, maxY: 210, width: 400, height: 120 };
  const viewport = { width: 1200, height: 800 };
  const insets = { top: 76, bottom: 104, left: 32, right: 32 };

  const camera = focusBox(box, viewport, 1, 48, insets, true);

  // Optical center of safe area
  const safeW = 1200 - 32 - 32; // 1136
  const safeH = 800 - 76 - 104; // 620
  const expectedCenterX = 32 + safeW / 2; // 600
  const expectedCenterY = 76 + safeH / 2; // 386

  const boxCenterX = 40 + 400 / 2; // 240
  const boxCenterY = 90 + 120 / 2; // 150

  const actualCenterX = boxCenterX * camera.zoom + camera.x;
  const actualCenterY = boxCenterY * camera.zoom + camera.y;

  assert.ok(Math.abs(actualCenterX - expectedCenterX) < 0.001, `X center mismatch: ${actualCenterX} vs ${expectedCenterX}`);
  assert.ok(Math.abs(actualCenterY - expectedCenterY) < 0.001, `Y center mismatch: ${actualCenterY} vs ${expectedCenterY}`);

  // Ensure content fits within safe bounds (clearing top 76px and bottom 104px)
  assert.ok(box.minY * camera.zoom + camera.y >= insets.top, 'top of box must be below top bar inset');
  assert.ok(box.maxY * camera.zoom + camera.y <= viewport.height - insets.bottom, 'bottom of box must be above dock inset');
});

test('focusBox with side panel space reservation shifts horizontal center for desktop chat', () => {
  const box = { minX: 40, minY: 90, maxX: 440, maxY: 210, width: 400, height: 120 };
  const viewport = { width: 1400, height: 900 };
  // When transcript panel takes 350px on the right
  const insetsWithPanel = { top: 76, bottom: 104, left: 32, right: 350 + 32 };

  const camera = focusBox(box, viewport, 1, 48, insetsWithPanel, true);

  const safeW = 1400 - 32 - 382; // 986
  const expectedCenterX = 32 + safeW / 2; // 525

  const boxCenterX = 240;
  const actualCenterX = boxCenterX * camera.zoom + camera.x;

  assert.ok(Math.abs(actualCenterX - expectedCenterX) < 0.001, `Center with panel: ${actualCenterX} vs ${expectedCenterX}`);
  assert.ok(box.maxX * camera.zoom + camera.x <= 1400 - 350, 'content must not overlap the reserved right transcript panel');
});
