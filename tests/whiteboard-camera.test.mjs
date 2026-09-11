import test from 'node:test';
import assert from 'node:assert/strict';
import { clampZoom, zoomAtPoint, focusBox, computeBoundingBox } from '../hyperknow-spa/src/replica/whiteboard/camera.ts';

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

test('camera focus fits a lesson item inside a tablet canvas', () => {
  const box = computeBoundingBox([{ x: 900, y: 800, width: 400, height: 300 }]);
  const viewport = { width: 680, height: 480 };
  const camera = focusBox(box, viewport, 1, 40);
  assert.ok(box.minX * camera.zoom + camera.x >= 0);
  assert.ok(box.minY * camera.zoom + camera.y >= 0);
  assert.ok(box.maxX * camera.zoom + camera.x <= viewport.width);
  assert.ok(box.maxY * camera.zoom + camera.y <= viewport.height);
});
