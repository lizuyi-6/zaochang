"use client";

import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import {
  ArrowLeft,
  Expand,
  MoonStar,
  Pause,
  Play,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import * as THREE from "three";
import styles from "./galaxy.module.css";

type TargetId = "aurelia" | "nyx" | "caelum";

type OrbitConfig = {
  radiusX: number;
  radiusZ: number;
  tilt: number;
  phase: number;
  speed: number;
  color: number;
  opacity: number;
};

const ORBITS: Record<TargetId, OrbitConfig> = {
  aurelia: { radiusX: 4.7, radiusZ: 3.7, tilt: 0.3, phase: 0.65, speed: 0.009, color: 0x8b665d, opacity: 0.075 },
  nyx: { radiusX: 7.7, radiusZ: 6.2, tilt: -0.5, phase: 3.65, speed: 0.006, color: 0x4f476d, opacity: 0.055 },
  caelum: { radiusX: 11, radiusZ: 8.8, tilt: 0.7, phase: 5.75, speed: 0.0045, color: 0x6977a8, opacity: 0.045 },
};

const SYSTEMS: Array<{
  id: TargetId;
  index: string;
  name: string;
  type: string;
  chapter: string;
  title: string;
  body: string;
  coda: string;
  lightAge: string;
  epoch: string;
  distance: string;
  accent: string;
  cameraOffset: [number, number, number];
  focusOffset: [number, number, number];
  mobileCameraOffset: [number, number, number];
  mobileFocusOffset: [number, number, number];
}> = [
  {
    id: "aurelia",
    index: "01",
    name: "AURELIA",
    type: "RING GIANT",
    chapter: "起源",
    title: "所有光都曾独自出发",
    body: "在名字、历史和见证者出现以前，恒星已经把漫长的沉默写进宇宙。",
    coda: "我们以为自己在回忆，其实只是旧日的光终于抵达。",
    lightAge: "38.6 MIN",
    epoch: "THE FIRST WITNESS",
    distance: "04.72 AU",
    accent: "#b88961",
    cameraOffset: [5.2, 3, 11.8],
    focusOffset: [-1.7, -0.15, 0],
    mobileCameraOffset: [3.2, 3.2, 13.8],
    mobileFocusOffset: [-0.25, -0.1, 0],
  },
  {
    id: "nyx",
    index: "02",
    name: "NYX",
    type: "EMBER WORLD",
    chapter: "造史",
    title: "人类把偶然称为命运",
    body: "我们用故事组织陌生人，用年代丈量恐惧，再把选择写成仿佛必然的历史。",
    coda: "文明向前，并不代表它知道要去哪里。",
    lightAge: "67.7 MIN",
    epoch: "THE SHARED FICTION",
    distance: "08.13 AU",
    accent: "#9a6674",
    cameraOffset: [-3.2, 2.4, 8.8],
    focusOffset: [-1.4, 0, 0],
    mobileCameraOffset: [-2.5, 2.8, 10],
    mobileFocusOffset: [0, -0.1, 0],
  },
  {
    id: "caelum",
    index: "03",
    name: "CAELUM",
    type: "ICE WORLD",
    chapter: "余响",
    title: "未来先于我们醒来",
    body: "当记忆可以被保存、预测和重写，真正稀缺的也许不再是答案，而是决定成为什么。",
    coda: "终点不是被计算出来的，它仍等待一次自由的选择。",
    lightAge: "107.3 MIN",
    epoch: "BEYOND THE LAST PROPHECY",
    distance: "12.90 AU",
    accent: "#6977a8",
    cameraOffset: [-1.8, 2.8, 8.8],
    focusOffset: [-1.6, 0, 0],
    mobileCameraOffset: [0.5, 3, 10.2],
    mobileFocusOffset: [-0.2, 0, 0],
  },
];

const starVertexShader = `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uWarp;
  uniform float uPassage;
  uniform float uMaxSize;
  attribute float aScale;
  attribute float aPhase;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec3 transformed = position;
    float depthFactor = abs(transformed.z) * 0.03 + 1.0;
    transformed.xy *= 1.0 + uWarp * 0.34 * depthFactor;
    transformed.z += sign(transformed.z + 0.001) * uWarp * 5.5;
    transformed.xy *= 1.0 + uPassage * 0.18 * depthFactor;
    transformed.z += sign(transformed.z + 0.001) * uPassage * 3.2;

    vec4 viewPosition = modelViewMatrix * vec4(transformed, 1.0);
    float pulse = 0.76 + 0.24 * sin(uTime * 0.86 + aPhase);
    float pointSize = aScale * uPixelRatio * pulse * (54.0 / max(2.0, -viewPosition.z));
    pointSize *= 1.0 + uWarp * 1.25 + uPassage * 0.72;
    gl_PointSize = clamp(pointSize, 0.65, uMaxSize);
    gl_Position = projectionMatrix * viewPosition;
    vColor = color;
    vAlpha = 0.72 + pulse * 0.28;
  }
`;

const starFragmentShader = `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec2 point = gl_PointCoord - 0.5;
    float distanceToCenter = length(point) * 2.0;
    if (distanceToCenter > 1.0) discard;
    float core = 1.0 - smoothstep(0.0, 0.18, distanceToCenter);
    float halo = 1.0 - smoothstep(0.08, 1.0, distanceToCenter);
    gl_FragColor = vec4(vColor * (0.54 + core * 0.46), (halo * 0.5 + core * 0.32) * vAlpha);
  }
`;

const nebulaVertexShader = `
  varying vec3 vLocalPosition;

  void main() {
    vLocalPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const nebulaFragmentShader = `
  uniform float uTime;
  uniform float uDetail;
  uniform float uPassage;
  varying vec3 vLocalPosition;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z
    );
  }

  float fbm(vec3 p) {
    float value = noise(p) * 0.55;
    p = p * 2.02 + 1.7;
    value += noise(p) * 0.26;
    if (uDetail > 0.5) {
      p = p * 2.03 + 2.1;
      value += noise(p) * 0.13;
      p = p * 2.01 + 0.9;
      value += noise(p) * 0.06;
    }
    return value;
  }

  void main() {
    vec3 direction = normalize(vLocalPosition);
    float time = uTime * 0.006;
    float first = fbm(direction * 3.3 + vec3(time, -time * 0.7, time * 0.3));
    float warped = fbm(direction * 6.2 + vec3(first * 1.8, -first, time));
    float veil = smoothstep(0.5, 0.79, warped + first * 0.22);
    float dust = smoothstep(0.62, 0.82, fbm(direction * 9.0 - vec3(time * 0.5)));
    vec3 indigo = vec3(0.05, 0.035, 0.14);
    vec3 mist = vec3(0.19, 0.22, 0.38);
    vec3 color = mix(indigo, mist, smoothstep(0.44, 0.78, first));
    float alpha = veil * 0.16 - dust * 0.055;
    alpha *= 1.0 - uPassage * 0.58;
    gl_FragColor = vec4(color, max(0.0, alpha));
  }
`;

const planetVertexShader = `
  varying vec3 vNormal;
  varying vec3 vViewDirection;
  varying vec3 vLocalPosition;

  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDirection = normalize(-viewPosition.xyz);
    vLocalPosition = position;
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const planetFragmentShader = `
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vViewDirection;
  varying vec3 vLocalPosition;

  void main() {
    float latitude = vLocalPosition.y * 4.8;
    float longitude = atan(vLocalPosition.z, vLocalPosition.x);
    float current = sin(latitude * 3.2 + sin(longitude * 3.0 - uTime * 0.09) * 1.6);
    float storm = sin(longitude * 7.0 + latitude * 1.8 + uTime * 0.12) * 0.5 + 0.5;
    float bands = smoothstep(-0.8, 0.92, current * 0.72 + storm * 0.28);
    vec3 midnight = vec3(0.008, 0.014, 0.055);
    vec3 ocean = vec3(0.035, 0.16, 0.29);
    vec3 electric = vec3(0.32, 0.48, 0.64);
    vec3 color = mix(midnight, ocean, bands);
    color = mix(color, electric, pow(max(0.0, storm - 0.62), 2.0) * 0.72);
    float rawLight = dot(normalize(vNormal), normalize(vec3(-0.42, 0.46, 0.78)));
    float light = smoothstep(-0.24, 0.62, rawLight);
    float nightGlow = smoothstep(-0.78, -0.18, rawLight) * 0.055;
    float fresnel = pow(1.0 - max(dot(normalize(vNormal), normalize(vViewDirection)), 0.0), 3.2);
    color *= 0.08 + light * 0.9;
    color += nightGlow * vec3(0.18, 0.22, 0.36);
    color += fresnel * vec3(0.19, 0.43, 0.62) * 0.46;
    gl_FragColor = vec4(color, 1.0);
  }
`;

const atmosphereVertexShader = `
  varying vec3 vNormal;
  varying vec3 vViewDirection;

  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDirection = normalize(-viewPosition.xyz);
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const atmosphereFragmentShader = `
  varying vec3 vNormal;
  varying vec3 vViewDirection;

  void main() {
    float intensity = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewDirection))), 2.15);
    gl_FragColor = vec4(0.24, 0.36, 0.58, intensity * 0.54);
  }
`;

function makeGlowTexture() {
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

function makeDiffractionTexture() {
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

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function setOrbitalPosition(target: THREE.Object3D, orbit: OrbitConfig, elapsed: number) {
  const angle = orbit.phase + elapsed * orbit.speed;
  target.position.set(
    Math.cos(angle) * orbit.radiusX,
    Math.sin(angle) * orbit.tilt,
    Math.sin(angle) * orbit.radiusZ,
  );
}

function getOrbitResidual(target: THREE.Object3D, orbit: OrbitConfig) {
  const ellipse = (target.position.x ** 2) / (orbit.radiusX ** 2) + (target.position.z ** 2) / (orbit.radiusZ ** 2);
  const expectedY = (target.position.z / orbit.radiusZ) * orbit.tilt;
  return Math.max(Math.abs(ellipse - 1), Math.abs(target.position.y - expectedY));
}

function createOrbitLine(orbit: OrbitConfig) {
  const points = Array.from({ length: 240 }, (_, index) => {
    const angle = (index / 240) * Math.PI * 2;
    return new THREE.Vector3(
      Math.cos(angle) * orbit.radiusX,
      Math.sin(angle) * orbit.tilt,
      Math.sin(angle) * orbit.radiusZ,
    );
  });
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color: orbit.color, transparent: true, opacity: orbit.opacity });
  return new THREE.LineLoop(geometry, material);
}

export function GalaxyExperience() {
  const mountRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<TargetId>("aurelia");
  const cruiseRef = useRef(true);
  const pausedRef = useRef(false);
  const warpRef = useRef(0);
  const passageRef = useRef(0);
  const quietRef = useRef(false);
  const resetRef = useRef(0);
  const [activeTarget, setActiveTarget] = useState<TargetId>("aurelia");
  const [paused, setPaused] = useState(false);
  const [quiet, setQuiet] = useState(false);
  const [passageActive, setPassageActive] = useState(false);
  const [ready, setReady] = useState(false);
  const [webglError, setWebglError] = useState(false);

  const selectTarget = useCallback((id: TargetId) => {
    targetRef.current = id;
    warpRef.current = 0.22;
    setActiveTarget(id);
  }, []);

  const toggleCruise = useCallback(() => {
    cruiseRef.current = !cruiseRef.current;
  }, []);

  const togglePaused = useCallback(() => {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
  }, []);

  const toggleQuiet = useCallback(() => {
    quietRef.current = !quietRef.current;
    setQuiet(quietRef.current);
  }, []);

  const startPassage = useCallback(() => {
    passageRef.current = 1;
    setPassageActive(true);
  }, []);

  const stopPassage = useCallback(() => {
    passageRef.current = 0;
    setPassageActive(false);
  }, []);

  const resetView = useCallback(() => {
    targetRef.current = "aurelia";
    cruiseRef.current = true;
    resetRef.current += 1;
    setActiveTarget("aurelia");
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen?.();
      else await document.documentElement.requestFullscreen?.();
    } catch {
      // Fullscreen can be denied by browser policy without affecting the scene.
    }
  }, []);

  useEffect(() => {
    const mountNode = mountRef.current;
    if (!mountNode) return;
    const mount: HTMLDivElement = mountNode;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mobile = window.matchMedia("(max-width: 720px)").matches;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020109);
    scene.fog = new THREE.FogExp2(0x04030b, 0.011);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !mobile,
        alpha: false,
        powerPreference: "high-performance",
        preserveDrawingBuffer: false,
      });
    } catch {
      setWebglError(true);
      document.body.style.overflow = previousOverflow;
      return;
    }

    renderer.setClearColor(0x020109, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.64;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1 : 1.35));
    renderer.domElement.className = styles.canvas;
    renderer.domElement.dataset.testid = "galaxy-canvas";
    renderer.domElement.setAttribute("aria-hidden", "true");
    mount.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 180);
    camera.position.set(8, 3, 14);
    const currentLook = new THREE.Vector3();
    camera.lookAt(currentLook);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloomBaseStrength = mobile ? 0.18 : 0.26;
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), bloomBaseStrength, 0.42, 0.46);
    composer.addPass(bloom);

    const universe = new THREE.Group();
    const galaxy = new THREE.Group();
    const system = new THREE.Group();
    scene.add(universe);
    universe.add(galaxy, system);

    const animatedMaterials: THREE.ShaderMaterial[] = [];
    const glowTexture = makeGlowTexture();
    const diffractionTexture = makeDiffractionTexture();
    const nebulaMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uDetail: { value: mobile ? 0 : 1 },
        uPassage: { value: 0 },
      },
      vertexShader: nebulaVertexShader,
      fragmentShader: nebulaFragmentShader,
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      blending: THREE.NormalBlending,
    });
    animatedMaterials.push(nebulaMaterial);
    const nebulaSphere = new THREE.Mesh(new THREE.SphereGeometry(58, mobile ? 28 : 44, mobile ? 20 : 32), nebulaMaterial);
    universe.add(nebulaSphere);

    function createPoints(kind: "galaxy" | "dust" | "background" | "foreground") {
      const count = kind === "galaxy" ? (mobile ? 12000 : 35000) : kind === "dust" ? (mobile ? 1500 : 4200) : kind === "foreground" ? (mobile ? 260 : 720) : (mobile ? 1300 : 3800);
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      const scales = new Float32Array(count);
      const phases = new Float32Array(count);
      const color = new THREE.Color();
      const inner = new THREE.Color(kind === "dust" ? 0xff7ad9 : 0xfff2cf);
      const middle = new THREE.Color(kind === "dust" ? 0x7a5cff : 0x68d8ff);
      const outer = new THREE.Color(kind === "dust" ? 0x405cff : 0x6952ff);
      const random = seededRandom(kind === "galaxy" ? 73117 : kind === "dust" ? 48163 : kind === "foreground" ? 88643 : 19531);

      for (let index = 0; index < count; index += 1) {
        const offset = index * 3;
        if (kind === "background") {
          const radius = 38 + random() * 52;
          const theta = random() * Math.PI * 2;
          const phi = Math.acos(2 * random() - 1);
          positions[offset] = radius * Math.sin(phi) * Math.cos(theta);
          positions[offset + 1] = radius * Math.cos(phi);
          positions[offset + 2] = radius * Math.sin(phi) * Math.sin(theta);
          const temperature = random();
          color.set(temperature > 0.82 ? 0xffd9b0 : temperature > 0.36 ? 0xb8d8ff : 0x8878ff);
          scales[index] = 0.5 + random() * 1.15;
        } else if (kind === "foreground") {
          positions[offset] = (random() - 0.5) * 32;
          positions[offset + 1] = (random() - 0.5) * 18;
          positions[offset + 2] = -3 + random() * 22;
          color.set(random() > 0.7 ? 0xf2e8d5 : 0x7d87b8);
          scales[index] = 0.18 + random() * 0.52;
        } else {
          const radius = Math.pow(random(), kind === "galaxy" ? 1.46 : 1.1) * (kind === "galaxy" ? 16 : 19);
          const branch = ((index % 5) / 5) * Math.PI * 2;
          const angle = branch + radius * (kind === "galaxy" ? 0.59 : 0.5) + (random() - 0.5) * (kind === "galaxy" ? 0.62 : 1.5);
          const spread = (random() - 0.5) * (0.46 + radius * (kind === "galaxy" ? 0.075 : 0.16));
          positions[offset] = Math.cos(angle) * radius + spread;
          positions[offset + 1] = (random() - 0.5) * (kind === "galaxy" ? 0.52 + radius * 0.038 : 1.6 + radius * 0.12);
          positions[offset + 2] = Math.sin(angle) * radius + spread;
          const mix = radius / (kind === "galaxy" ? 16 : 19);
          color.copy(inner).lerp(middle, Math.min(1, mix * 1.5)).lerp(outer, Math.max(0, mix - 0.52) * 1.65);
          color.offsetHSL((random() - 0.5) * 0.035, 0, (random() - 0.5) * 0.1);
          scales[index] = kind === "galaxy" ? 0.55 + random() * 1.45 : 1.0 + random() * 2.6;
        }
        colors[offset] = color.r;
        colors[offset + 1] = color.g;
        colors[offset + 2] = color.b;
        phases[index] = random() * Math.PI * 2;
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      geometry.setAttribute("aScale", new THREE.BufferAttribute(scales, 1));
      geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
      const material = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uPixelRatio: { value: renderer.getPixelRatio() },
          uWarp: { value: 0 },
          uPassage: { value: 0 },
          uMaxSize: { value: kind === "background" ? 2.4 : kind === "galaxy" ? 3.8 : 5.2 },
        },
        vertexShader: starVertexShader,
        fragmentShader: starFragmentShader,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      animatedMaterials.push(material);
      const points = new THREE.Points(geometry, material);
      points.frustumCulled = false;
      return points;
    }

    const backgroundStars = createPoints("background");
    universe.add(backgroundStars);
    const galaxyStars = createPoints("galaxy");
    galaxyStars.rotation.x = -0.12;
    galaxyStars.rotation.z = 0.16;
    galaxy.add(galaxyStars);
    const dust = createPoints("dust");
    dust.rotation.x = -0.08;
    dust.rotation.z = -0.04;
    galaxy.add(dust);
    const foregroundDust = createPoints("foreground");
    universe.add(foregroundDust);

    const constellationGroup = new THREE.Group();
    const constellationPatterns: Array<{ points: Array<[number, number, number]>; color: number }> = [
      { points: [[-15, 7, -18], [-12.5, 8.8, -20], [-9.6, 7.5, -21], [-7.4, 9.2, -23], [-4.8, 7.2, -22]], color: 0x7784b6 },
      { points: [[8.5, 8.2, -22], [10.7, 6.5, -20], [13.3, 7.4, -23], [15.5, 5.2, -24], [12.1, 3.8, -22]], color: 0xa88f7e },
      { points: [[-13, -5.2, -24], [-10.5, -3.4, -22], [-7.7, -5.7, -25], [-5.3, -3.6, -23]], color: 0x5968a6 },
    ];
    constellationPatterns.forEach((pattern) => {
      const pointGeometry = new THREE.BufferGeometry().setFromPoints(pattern.points.map((point) => new THREE.Vector3(...point)));
      const pointMaterial = new THREE.PointsMaterial({ color: pattern.color, size: mobile ? 0.065 : 0.085, transparent: true, opacity: 0.62, depthWrite: false });
      constellationGroup.add(new THREE.Points(pointGeometry, pointMaterial));
      const segmentPoints: THREE.Vector3[] = [];
      for (let index = 0; index < pattern.points.length - 1; index += 1) {
        segmentPoints.push(new THREE.Vector3(...pattern.points[index]), new THREE.Vector3(...pattern.points[index + 1]));
      }
      const lineGeometry = new THREE.BufferGeometry().setFromPoints(segmentPoints);
      const lineMaterial = new THREE.LineBasicMaterial({ color: pattern.color, transparent: true, opacity: 0.11, blending: THREE.AdditiveBlending });
      constellationGroup.add(new THREE.LineSegments(lineGeometry, lineMaterial));
    });
    universe.add(constellationGroup);

    const diffractionStars: THREE.Sprite[] = [];
    if (diffractionTexture) {
      const random = seededRandom(61937);
      const count = mobile ? 26 : 74;
      for (let index = 0; index < count; index += 1) {
        const material = new THREE.SpriteMaterial({
          map: diffractionTexture,
          color: index % 7 === 0 ? 0xd9c2a4 : 0xaab9e0,
          transparent: true,
          opacity: 0.24 + random() * 0.34,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        const sprite = new THREE.Sprite(material);
        const radius = 26 + random() * 34;
        const theta = random() * Math.PI * 2;
        const phi = Math.acos(2 * random() - 1);
        sprite.position.set(radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi), radius * Math.sin(phi) * Math.sin(theta));
        const scale = 0.22 + random() * 0.78;
        sprite.scale.setScalar(scale);
        sprite.userData.baseScale = scale;
        sprite.userData.phase = random() * Math.PI * 2;
        diffractionStars.push(sprite);
        universe.add(sprite);
      }
    }

    const lightEchoes: THREE.Line[] = [];
    const echoRandom = seededRandom(77291);
    for (let index = 0; index < (mobile ? 1 : 4); index += 1) {
      const length = 1.5 + echoRandom() * 2.6;
      const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(-length, -length * 0.16, 0.15)]);
      const material = new THREE.LineBasicMaterial({ color: index % 2 ? 0xb9c7ec : 0xe5d4bd, transparent: true, opacity: 0, blending: THREE.AdditiveBlending });
      const line = new THREE.Line(geometry, material);
      line.position.set(-20 + echoRandom() * 16, -7 + echoRandom() * 15, -8 - echoRandom() * 16);
      line.userData.phase = echoRandom() * 18;
      line.userData.speed = 0.52 + echoRandom() * 0.48;
      line.userData.baseY = line.position.y;
      lightEchoes.push(line);
      universe.add(line);
    }

    if (glowTexture) {
      const nebulae = [
        { position: [-8, 1, -8], color: 0x272047, scale: 19 },
        { position: [9, -2, -11], color: 0x5968a6, scale: 22 },
        { position: [1, 4, -15], color: 0x3b315d, scale: 16 },
        { position: [-2, -5, -9], color: 0x6c4f59, scale: 14 },
      ];
      nebulae.forEach((item) => {
        const material = new THREE.SpriteMaterial({
          map: glowTexture,
          color: item.color,
          transparent: true,
          opacity: 0.034,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        const sprite = new THREE.Sprite(material);
        sprite.position.set(item.position[0], item.position[1], item.position[2]);
        sprite.scale.setScalar(item.scale);
        galaxy.add(sprite);
      });
    }

    const ambientLight = new THREE.AmbientLight(0x202344, 0.78);
    const keyLight = new THREE.DirectionalLight(0xe2d9c7, 2.7);
    keyLight.position.set(-8, 8, 10);
    const rimLight = new THREE.PointLight(0x5968a6, 54, 32, 2);
    rimLight.position.set(2, 1, -2);
    scene.add(ambientLight, keyLight, rimLight);
    const targetAccent = new THREE.Color(SYSTEMS[0].accent);
    const targetFog = new THREE.Color(0x04030b).lerp(targetAccent, 0.045);

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 40, 40),
      new THREE.MeshBasicMaterial({ color: 0xe2dccf }),
    );
    core.position.set(0, 0, -0.5);
    galaxy.add(core);
    if (glowTexture) {
      const coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0x8f9bc7,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }));
      coreGlow.position.copy(core.position);
      coreGlow.scale.setScalar(3.6);
      galaxy.add(coreGlow);
    }

    system.add(
      createOrbitLine(ORBITS.aurelia),
      createOrbitLine(ORBITS.nyx),
      createOrbitLine(ORBITS.caelum),
    );

    function createViewAnchors(parent: THREE.Group, target: (typeof SYSTEMS)[number]) {
      const cameraAnchor = new THREE.Object3D();
      cameraAnchor.position.set(...(mobile ? target.mobileCameraOffset : target.cameraOffset));
      const focusAnchor = new THREE.Object3D();
      focusAnchor.position.set(...(mobile ? target.mobileFocusOffset : target.focusOffset));
      parent.add(cameraAnchor, focusAnchor);
      return { cameraAnchor, focusAnchor };
    }

    const aurelia = new THREE.Group();
    setOrbitalPosition(aurelia, ORBITS.aurelia, 0);
    system.add(aurelia);
    const aureliaView = createViewAnchors(aurelia, SYSTEMS[0]);
    const aureliaVisual = new THREE.Group();
    aureliaVisual.rotation.z = -0.28;
    aurelia.add(aureliaVisual);

    const planetMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: planetVertexShader,
      fragmentShader: planetFragmentShader,
    });
    animatedMaterials.push(planetMaterial);
    const planet = new THREE.Mesh(new THREE.SphereGeometry(2.08, mobile ? 64 : 112, mobile ? 48 : 80), planetMaterial);
    aureliaVisual.add(planet);

    const atmosphereMaterial = new THREE.ShaderMaterial({
      vertexShader: atmosphereVertexShader,
      fragmentShader: atmosphereFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
    });
    const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(2.23, 72, 56), atmosphereMaterial);
    aureliaVisual.add(atmosphere);

    const ringGeometry = new THREE.RingGeometry(2.7, 4.35, mobile ? 160 : 320, 1);
    const ringMaterial = new THREE.ShaderMaterial({
      vertexShader: `
        varying float vRadius;
        varying vec2 vUv;
        void main() {
          vRadius = length(position.xy);
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying float vRadius;
        varying vec2 vUv;
        void main() {
          float stripe = sin(vRadius * 25.0) * 0.5 + 0.5;
          float fine = sin(vRadius * 83.0) * 0.5 + 0.5;
          float edge = smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.86, vUv.y);
          vec3 color = mix(vec3(0.14, 0.17, 0.28), vec3(0.58, 0.52, 0.44), stripe);
          float alpha = (0.045 + stripe * 0.13 + fine * 0.035) * edge;
          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const rings = new THREE.Mesh(ringGeometry, ringMaterial);
    rings.rotation.x = Math.PI / 2;
    rings.rotation.z = 0.08;
    aureliaVisual.add(rings);

    const moonOrbit = new THREE.Group();
    aureliaVisual.add(moonOrbit);
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 32, 24),
      new THREE.MeshStandardMaterial({ color: 0xbeb9b0, roughness: 0.82, metalness: 0.03 }),
    );
    moon.position.set(4.8, 0.45, 0.2);
    moonOrbit.add(moon);

    function addAtmosphere(parent: THREE.Group, radius: number, color: number, opacity: number) {
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
      });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 56, 40), material);
      parent.add(mesh);
    }

    const nyx = new THREE.Group();
    setOrbitalPosition(nyx, ORBITS.nyx, 0);
    const nyxView = createViewAnchors(nyx, SYSTEMS[1]);
    const nyxPlanet = new THREE.Mesh(
      new THREE.SphereGeometry(1.06, 64, 48),
      new THREE.MeshStandardMaterial({ color: 0x3e1721, emissive: 0x4a151f, emissiveIntensity: 0.16, roughness: 0.88 }),
    );
    nyx.add(nyxPlanet);
    addAtmosphere(nyx, 1.13, 0x9a6674, 0.1);
    system.add(nyx);

    const caelum = new THREE.Group();
    setOrbitalPosition(caelum, ORBITS.caelum, 0);
    const caelumView = createViewAnchors(caelum, SYSTEMS[2]);
    const caelumPlanet = new THREE.Mesh(
      new THREE.SphereGeometry(1.42, 72, 52),
      new THREE.MeshPhysicalMaterial({
        color: 0x314477,
        emissive: 0x1a244b,
        emissiveIntensity: 0.22,
        roughness: 0.52,
        metalness: 0.05,
        clearcoat: 0.38,
        clearcoatRoughness: 0.35,
      }),
    );
    caelum.add(caelumPlanet);
    addAtmosphere(caelum, 1.52, 0x6977a8, 0.1);
    const caelumRing = createOrbitLine({
      radiusX: 2.05,
      radiusZ: 2.05,
      tilt: 0.12,
      phase: 0,
      speed: 0,
      color: 0x6977a8,
      opacity: 0.18,
    });
    caelumRing.rotation.x = 0.35;
    caelum.add(caelumRing);
    system.add(caelum);

    const bodies = {
      aurelia: { group: aurelia, cameraAnchor: aureliaView.cameraAnchor, focusAnchor: aureliaView.focusAnchor },
      nyx: { group: nyx, cameraAnchor: nyxView.cameraAnchor, focusAnchor: nyxView.focusAnchor },
      caelum: { group: caelum, cameraAnchor: caelumView.cameraAnchor, focusAnchor: caelumView.focusAnchor },
    } satisfies Record<TargetId, { group: THREE.Group; cameraAnchor: THREE.Object3D; focusAnchor: THREE.Object3D }>;

    universe.updateMatrixWorld(true);
    bodies.aurelia.cameraAnchor.getWorldPosition(camera.position);
    bodies.aurelia.focusAnchor.getWorldPosition(currentLook);
    camera.lookAt(currentLook);

    const pointer = new THREE.Vector2();
    const raycaster = new THREE.Raycaster();
    const pickables: Array<{ mesh: THREE.Mesh; id: TargetId }> = [
      { mesh: planet, id: "aurelia" },
      { mesh: nyxPlanet, id: "nyx" },
      { mesh: caelumPlanet, id: "caelum" },
    ];
    const dragRotation = new THREE.Vector2();
    let dragging = false;
    let dragX = 0;
    let dragY = 0;
    let dragDistance = 0;
    let appliedTarget = targetRef.current;
    let appliedReset = resetRef.current;
    const targetCamera = new THREE.Vector3();
    const targetLook = new THREE.Vector3();
    const projectedTarget = new THREE.Vector3();
    let activeBody = bodies[targetRef.current];
    let zoom = 1;
    let elapsed = 0;
    let passage = 0;
    let frame = 0;
    let hidden = false;

    function applyTarget(id: TargetId) {
      const target = SYSTEMS.find((item) => item.id === id) ?? SYSTEMS[0];
      activeBody = bodies[id];
      targetAccent.set(target.accent);
      targetFog.set(0x04030b).lerp(targetAccent, 0.045);
      appliedTarget = id;
    }

    function handlePointerDown(event: PointerEvent) {
      dragging = true;
      dragX = event.clientX;
      dragY = event.clientY;
      dragDistance = 0;
      pointer.x = (event.clientX / Math.max(1, mount.clientWidth)) * 2 - 1;
      pointer.y = -((event.clientY / Math.max(1, mount.clientHeight)) * 2 - 1);
      renderer.domElement.setPointerCapture(event.pointerId);
    }

    function handlePointerMove(event: PointerEvent) {
      pointer.x = (event.clientX / Math.max(1, mount.clientWidth)) * 2 - 1;
      pointer.y = -((event.clientY / Math.max(1, mount.clientHeight)) * 2 - 1);
      if (!dragging) return;
      const deltaX = event.clientX - dragX;
      const deltaY = event.clientY - dragY;
      dragDistance += Math.abs(deltaX) + Math.abs(deltaY);
      dragRotation.x += deltaX * 0.0022;
      dragRotation.y += deltaY * 0.0016;
      dragRotation.y = THREE.MathUtils.clamp(dragRotation.y, -0.32, 0.32);
      dragX = event.clientX;
      dragY = event.clientY;
    }

    function handlePointerUp(event: PointerEvent) {
      dragging = false;
      if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
      if (dragDistance < 8) {
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(pickables.map((item) => item.mesh), false)[0];
        const picked = pickables.find((item) => item.mesh === hit?.object);
        if (picked) selectTarget(picked.id);
      }
    }

    function handleWheel(event: WheelEvent) {
      event.preventDefault();
      zoom = THREE.MathUtils.clamp(zoom + event.deltaY * 0.00045, 0.76, 1.28);
    }

    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.matches("button, a, input, textarea, select, [contenteditable='true']")) return;
      if (event.key === "1") selectTarget("aurelia");
      if (event.key === "2") selectTarget("nyx");
      if (event.key === "3") selectTarget("caelum");
      if (event.key.toLowerCase() === "r") resetView();
      if (event.key.toLowerCase() === "q") toggleQuiet();
      if (event.code === "Space") {
        event.preventDefault();
        toggleCruise();
      }
    }

    function handleVisibility() {
      hidden = document.hidden;
    }

    function handleContextLost(event: Event) {
      event.preventDefault();
      setWebglError(true);
    }

    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);
    renderer.domElement.addEventListener("pointercancel", handlePointerUp);
    renderer.domElement.addEventListener("wheel", handleWheel, { passive: false });
    renderer.domElement.addEventListener("webglcontextlost", handleContextLost);
    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("visibilitychange", handleVisibility);

    let resizeFrame = 0;
    let renderedWidth = 0;
    let renderedHeight = 0;

    function resize() {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      if (width === renderedWidth && height === renderedHeight) return;
      renderedWidth = width;
      renderedHeight = height;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      composer.setSize(width, height);
      bloom.setSize(width, height);
      animatedMaterials.forEach((material) => {
        if (material.uniforms.uPixelRatio) material.uniforms.uPixelRatio.value = renderer.getPixelRatio();
      });
    }

    const resizeObserver = new ResizeObserver(() => {
      window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(resize);
    });
    resizeObserver.observe(mount);
    resize();

    let animationFrame = 0;
    let lastRenderTime = 0;
    let previousFrameTime = 0;

    function animate(timestamp = 0) {
      animationFrame = window.requestAnimationFrame(animate);
      if (hidden) return;
      const targetChanged = targetRef.current !== appliedTarget || resetRef.current !== appliedReset;
      const minimumFrameInterval = pausedRef.current || prefersReducedMotion ? 120 : 16;
      if (!targetChanged && timestamp - lastRenderTime < minimumFrameInterval) return;
      lastRenderTime = timestamp;
      const delta = previousFrameTime === 0 ? 0 : Math.min((timestamp - previousFrameTime) / 1000, 0.05);
      previousFrameTime = timestamp;
      if (!pausedRef.current) elapsed += delta;

      if (targetRef.current !== appliedTarget) applyTarget(targetRef.current);
      if (resetRef.current !== appliedReset) {
        appliedReset = resetRef.current;
        dragRotation.set(0, 0);
        zoom = 1;
        applyTarget("aurelia");
      }

      const warp = warpRef.current;
      warpRef.current *= 0.94;
      if (warpRef.current < 0.002) warpRef.current = 0;
      passage = THREE.MathUtils.lerp(passage, passageRef.current, passageRef.current > passage ? 0.055 : 0.032);
      animatedMaterials.forEach((material) => {
        if (material.uniforms.uTime) material.uniforms.uTime.value = prefersReducedMotion ? 0 : elapsed;
        if (material.uniforms.uWarp) material.uniforms.uWarp.value = warp;
        if (material.uniforms.uPassage) material.uniforms.uPassage.value = prefersReducedMotion ? 0 : passage;
      });

      const quietMotion = quietRef.current ? 0.34 : 1;
      if (!pausedRef.current && !prefersReducedMotion) {
        setOrbitalPosition(aurelia, ORBITS.aurelia, elapsed);
        setOrbitalPosition(nyx, ORBITS.nyx, elapsed);
        setOrbitalPosition(caelum, ORBITS.caelum, elapsed);
        galaxy.rotation.y = elapsed * 0.004 * quietMotion;
        dust.rotation.y = -elapsed * 0.003 * quietMotion;
        backgroundStars.rotation.y = elapsed * 0.0012 * quietMotion;
        foregroundDust.position.z = Math.sin(elapsed * 0.028) * 0.42 * quietMotion;
        constellationGroup.rotation.y = Math.sin(elapsed * 0.018) * 0.012;
        planet.rotation.y = elapsed * 0.026 * quietMotion;
        moonOrbit.rotation.y = elapsed * 0.11 * quietMotion;
        nyxPlanet.rotation.y = elapsed * 0.034 * quietMotion;
        caelumPlanet.rotation.y = -elapsed * 0.024 * quietMotion;
        system.rotation.y = Math.sin(elapsed * 0.034) * 0.012 * quietMotion;
        diffractionStars.forEach((sprite) => {
          const pulse = 0.88 + Math.sin(elapsed * 0.38 + sprite.userData.phase) * 0.12;
          sprite.scale.setScalar(sprite.userData.baseScale * pulse);
        });
        lightEchoes.forEach((line) => {
          const cycle = (elapsed * line.userData.speed + line.userData.phase) % 18;
          const active = cycle > 12 ? Math.sin(((cycle - 12) / 6) * Math.PI) : 0;
          line.position.x = -20 + Math.max(0, cycle - 12) * 7.4;
          line.position.y = line.userData.baseY + Math.sin(elapsed * 0.13 + line.userData.phase) * 0.25;
          (line.material as THREE.LineBasicMaterial).opacity = active * (quietRef.current ? 0.07 : 0.13);
        });
      }

      universe.rotation.y = THREE.MathUtils.lerp(universe.rotation.y, dragRotation.x + pointer.x * 0.032 * quietMotion, 0.028);
      universe.rotation.x = THREE.MathUtils.lerp(universe.rotation.x, dragRotation.y - pointer.y * 0.018 * quietMotion, 0.028);
      rimLight.color.lerp(targetAccent, 0.018);
      scene.fog?.color.lerp(targetFog, 0.012);

      universe.updateMatrixWorld(true);
      activeBody.cameraAnchor.getWorldPosition(targetCamera);
      activeBody.focusAnchor.getWorldPosition(targetLook);
      if (cruiseRef.current && !prefersReducedMotion) {
        const radius = quietRef.current ? 0.05 : 0.12;
        targetCamera.x += Math.sin(elapsed * 0.07) * radius;
        targetCamera.y += Math.cos(elapsed * 0.052) * radius * 0.55;
        targetCamera.z += Math.cos(elapsed * 0.07) * radius;
      }
      targetCamera.sub(targetLook).multiplyScalar(zoom).add(targetLook);
      targetCamera.x += pointer.x * 0.22 * quietMotion;
      targetCamera.y += pointer.y * 0.13 * quietMotion;
      camera.position.lerp(targetCamera, prefersReducedMotion ? 0.12 : 0.024);
      currentLook.lerp(targetLook, 0.028);
      camera.lookAt(currentLook);
      camera.fov = THREE.MathUtils.lerp(camera.fov, 48 + warp * 6 + passage * 9, 0.06);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      activeBody.group.getWorldPosition(projectedTarget).project(camera);
      renderer.domElement.dataset.target = appliedTarget;
      renderer.domElement.dataset.targetNdcX = projectedTarget.x.toFixed(4);
      renderer.domElement.dataset.targetNdcY = projectedTarget.y.toFixed(4);
      renderer.domElement.dataset.orbitResidual = Math.max(
        getOrbitResidual(aurelia, ORBITS.aurelia),
        getOrbitResidual(nyx, ORBITS.nyx),
        getOrbitResidual(caelum, ORBITS.caelum),
      ).toExponential(2);
      bloom.strength = bloomBaseStrength - (quietRef.current ? 0.045 : 0) + warp * 0.18 + passage * 0.14;
      composer.render();

      frame += 1;
      renderer.domElement.dataset.frame = String(frame);
      if (frame === 2) setReady(true);
    }

    animate();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.cancelAnimationFrame(resizeFrame);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      renderer.domElement.removeEventListener("pointercancel", handlePointerUp);
      renderer.domElement.removeEventListener("wheel", handleWheel);
      renderer.domElement.removeEventListener("webglcontextlost", handleContextLost);
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("visibilitychange", handleVisibility);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line || object instanceof THREE.Sprite) {
          if (!(object instanceof THREE.Sprite)) object.geometry?.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material?.dispose());
        }
      });
      glowTexture?.dispose();
      diffractionTexture?.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      document.body.style.overflow = previousOverflow;
    };
  }, [resetView, selectTarget, toggleCruise, toggleQuiet]);

  const activeSystem = SYSTEMS.find((item) => item.id === activeTarget) ?? SYSTEMS[0];

  return (
    <main className={`${styles.page} ${quiet ? styles.quiet : ""} ${passageActive ? styles.passageActive : ""}`} data-testid="galaxy-page">
      <div ref={mountRef} className={styles.scene} data-testid="galaxy-scene" />
      <div className={styles.vignette} aria-hidden="true" />
      <div className={styles.filmGrain} aria-hidden="true" />

      <div className={`${styles.loader} ${ready ? styles.loaderHidden : ""}`} aria-hidden={ready}>
        <span className={styles.loaderMark}><i /><i /><i /></span>
        <strong>星光抵达之前</strong>
        <small>请允许黑暗停留片刻</small>
        <span className={styles.loaderLine}><i /></span>
      </div>

      {webglError && (
        <section className={styles.error} role="alert">
          <strong>星图无法启动</strong>
          <p>当前设备没有提供可用的 WebGL 图形环境。</p>
          <Link href="/">返回造场</Link>
        </section>
      )}

      <header className={styles.header}>
        <Link className={styles.back} href="/" aria-label="返回造场社区" title="返回造场社区">
          <ArrowLeft size={18} />
        </Link>
        <div className={styles.brand}>
          <span className={styles.brandMark}><i /><i /><i /></span>
          <div><strong>ASTRA</strong><small>AN OBSERVATION OF LIGHT</small></div>
        </div>
      </header>

      <section key={activeSystem.id} className={styles.hero} style={{ "--philosophy-accent": activeSystem.accent } as CSSProperties}>
        <span className={styles.kicker}>{activeSystem.index} / {activeSystem.chapter} · {activeSystem.epoch}</span>
        <h1>{activeSystem.title}</h1>
        <p>{activeSystem.body}</p>
        <blockquote>{activeSystem.coda}</blockquote>
      </section>

      <nav className={styles.systemNav} aria-label="星光章节">
        {SYSTEMS.map((item) => (
          <button
            type="button"
            key={item.id}
            className={activeTarget === item.id ? styles.systemActive : ""}
            onClick={() => selectTarget(item.id)}
            aria-pressed={activeTarget === item.id}
          >
            <i style={{ background: item.accent }} />
            <strong>{item.chapter}</strong>
            <small>{item.name}</small>
          </button>
        ))}
      </nav>

      <aside className={styles.observation} aria-live="polite">
        <span>{activeSystem.name} · {activeSystem.type}</span>
        <b>{activeSystem.lightAge}</b>
        <small>光在抵达这里以前，已经独自走了很久。</small>
      </aside>

      <div className={styles.controls} aria-label="星图控制">
        <button type="button" onClick={togglePaused} title={paused ? "继续星图" : "暂停星图"} aria-label={paused ? "继续星图" : "暂停星图"}>
          {paused ? <Play size={18} /> : <Pause size={18} />}
        </button>
        <button type="button" onClick={toggleQuiet} className={quiet ? styles.controlActive : ""} title={quiet ? "离开静默模式" : "进入静默模式"} aria-label={quiet ? "离开静默模式" : "进入静默模式"} aria-pressed={quiet}>
          <MoonStar size={18} />
        </button>
        <button
          type="button"
          className={styles.passageControl}
          onPointerDown={startPassage}
          onPointerUp={stopPassage}
          onPointerLeave={stopPassage}
          onPointerCancel={stopPassage}
          title="让时间经过"
          aria-label="让时间经过"
          aria-pressed={passageActive}
        >
          <Sparkles size={18} /><span>时间经过</span>
        </button>
        <button type="button" onClick={toggleFullscreen} title="切换全屏" aria-label="切换全屏">
          <Expand size={17} />
        </button>
      </div>

      <p className={styles.temporalEcho}>世界一遍遍重写结局，只为了等一次不服从预言的选择。</p>

      <p className={styles.srOnly}>穿过静默的星尘，观察关于起源、造史与余响的自洽三维星系。</p>
    </main>
  );
}
