// 银河场景的纯函数资源:程序化纹理、轨道几何与配置表(自 galaxy-experience.tsx 纯搬移,逐字未改)。
// 不含 React/状态——可被场景构建代码与单元测试直接使用。
import * as THREE from "three";
import type { GalaxyId, OrbitConfig, PlanetSurface } from "./cosmic-atlas";

export function makeGlowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.08, "rgba(255,255,255,.92)");
  gradient.addColorStop(0.28, "rgba(255,255,255,.34)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function makeDiffractionTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const glow = context.createRadialGradient(128, 128, 0, 128, 128, 118);
  glow.addColorStop(0, "rgba(255,250,236,1)");
  glow.addColorStop(0.06, "rgba(255,246,220,.96)");
  glow.addColorStop(0.22, "rgba(164,187,255,.24)");
  glow.addColorStop(1, "rgba(80,92,160,0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, 256, 256);
  const beam = context.createLinearGradient(0, 128, 256, 128);
  beam.addColorStop(0, "rgba(255,255,255,0)");
  beam.addColorStop(0.45, "rgba(226,235,255,.06)");
  beam.addColorStop(0.5, "rgba(255,250,232,.78)");
  beam.addColorStop(0.55, "rgba(226,235,255,.06)");
  beam.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = beam;
  context.fillRect(0, 126, 256, 4);
  context.save();
  context.translate(128, 128);
  context.rotate(Math.PI / 2);
  context.translate(-128, -128);
  context.fillStyle = beam;
  context.fillRect(0, 127, 256, 2);
  context.restore();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export const PLANET_ORBIT_DISTANCE_SCALE = 3.4;
export const PLANET_GALAXY_OFFSET = 80;

export function setOrbitalPosition(target: THREE.Object3D, orbit: OrbitConfig, elapsed: number, distanceScale = 1) {
  const angle = orbit.phase + elapsed * orbit.speed;
  target.position.set(
    Math.cos(angle) * orbit.radiusX * distanceScale,
    Math.sin(angle) * orbit.tilt,
    Math.sin(angle) * orbit.radiusZ * distanceScale,
  );
}

export function getOrbitResidual(target: THREE.Object3D, orbit: OrbitConfig, distanceScale = 1) {
  const radiusX = orbit.radiusX * distanceScale;
  const radiusZ = orbit.radiusZ * distanceScale;
  const ellipse = (target.position.x ** 2) / (radiusX ** 2) + (target.position.z ** 2) / (radiusZ ** 2);
  const expectedY = (target.position.z / radiusZ) * orbit.tilt;
  return Math.max(Math.abs(ellipse - 1), Math.abs(target.position.y - expectedY));
}

export function cubicBezier(
  target: THREE.Vector3,
  start: THREE.Vector3,
  controlA: THREE.Vector3,
  controlB: THREE.Vector3,
  end: THREE.Vector3,
  progress: number,
) {
  const inverse = 1 - progress;
  return target
    .copy(start)
    .multiplyScalar(inverse ** 3)
    .addScaledVector(controlA, 3 * inverse * inverse * progress)
    .addScaledVector(controlB, 3 * inverse * progress * progress)
    .addScaledVector(end, progress ** 3);
}

export function createOrbitLine(orbit: OrbitConfig, distanceScale = 1) {
  const points = Array.from({ length: 240 }, (_, index) => {
    const angle = (index / 240) * Math.PI * 2;
    return new THREE.Vector3(
      Math.cos(angle) * orbit.radiusX * distanceScale,
      Math.sin(angle) * orbit.tilt,
      Math.sin(angle) * orbit.radiusZ * distanceScale,
    );
  });
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color: orbit.color, transparent: true, opacity: orbit.opacity });
  return new THREE.LineLoop(geometry, material);
}

export const PLANET_SURFACE_INDEX: Record<PlanetSurface, number> = {
  gas: 0,
  lava: 1,
  ice: 2,
  ocean: 3,
  desert: 4,
  forest: 5,
  rogue: 6,
  crystal: 7,
};

export const STELLAR_PROFILES: Record<GalaxyId, {
  radius: number;
  colorA: number;
  colorB: number;
  corona: number;
  intensity: number;
  seed: number;
}> = {
  origo: { radius: 2.55, colorA: 0xfff4cf, colorB: 0xf09b45, corona: 0xffc66d, intensity: 18, seed: 1.3 },
  mnemora: { radius: 3.05, colorA: 0xffd69a, colorB: 0xa83f22, corona: 0xe88948, intensity: 16, seed: 2.7 },
  miralume: { radius: 2.35, colorA: 0xf4fbff, colorB: 0x6f9fff, corona: 0x91bcff, intensity: 20, seed: 4.1 },
  antevera: { radius: 2.15, colorA: 0xeafff4, colorB: 0x67c5ae, corona: 0x8be1c9, intensity: 19, seed: 5.6 },
};
