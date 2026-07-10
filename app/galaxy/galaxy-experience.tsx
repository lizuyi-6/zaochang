"use client";

import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import {
  ArrowLeft,
  Expand,
  Gauge,
  Orbit,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import styles from "./galaxy.module.css";

type TargetId = "aurelia" | "nyx" | "caelum";

const SYSTEMS: Array<{
  id: TargetId;
  index: string;
  name: string;
  type: string;
  distance: string;
  accent: string;
  camera: [number, number, number];
  look: [number, number, number];
}> = [
  {
    id: "aurelia",
    index: "01",
    name: "AURELIA",
    type: "RING GIANT",
    distance: "04.72 AU",
    accent: "#7ce8ff",
    camera: [7.2, 2.8, 11.4],
    look: [2.6, -0.35, 1.8],
  },
  {
    id: "nyx",
    index: "02",
    name: "NYX",
    type: "EMBER MOON",
    distance: "08.13 AU",
    accent: "#ff6a7d",
    camera: [-3.8, 3.1, 4.6],
    look: [-6.8, 1.4, -4],
  },
  {
    id: "caelum",
    index: "03",
    name: "CAELUM",
    type: "ICE WORLD",
    distance: "12.90 AU",
    accent: "#8a7dff",
    camera: [4.5, 4.8, 1.2],
    look: [6.4, 2.4, -5.5],
  },
];

const starVertexShader = `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uWarp;
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

    vec4 viewPosition = modelViewMatrix * vec4(transformed, 1.0);
    float pulse = 0.76 + 0.24 * sin(uTime * 0.86 + aPhase);
    float pointSize = aScale * uPixelRatio * pulse * (54.0 / max(2.0, -viewPosition.z));
    pointSize *= 1.0 + uWarp * 1.25;
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
    vec3 midnight = vec3(0.018, 0.055, 0.16);
    vec3 ocean = vec3(0.02, 0.31, 0.58);
    vec3 electric = vec3(0.18, 0.87, 1.0);
    vec3 color = mix(midnight, ocean, bands);
    color = mix(color, electric, pow(max(0.0, storm - 0.62), 2.0) * 0.72);
    float light = max(dot(normalize(vNormal), normalize(vec3(-0.35, 0.5, 0.8))), 0.0);
    float fresnel = pow(1.0 - max(dot(normalize(vNormal), normalize(vViewDirection)), 0.0), 3.2);
    color *= 0.32 + light * 0.92;
    color += fresnel * vec3(0.08, 0.65, 1.0) * 0.82;
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
    gl_FragColor = vec4(0.18, 0.78, 1.0, intensity * 0.82);
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

function createOrbitLine(radiusX: number, radiusZ: number, color: number, opacity: number, tilt: number) {
  const points = Array.from({ length: 240 }, (_, index) => {
    const angle = (index / 240) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(angle) * radiusX, Math.sin(angle) * tilt, Math.sin(angle) * radiusZ);
  });
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  return new THREE.LineLoop(geometry, material);
}

export function GalaxyExperience() {
  const mountRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<TargetId>("aurelia");
  const cruiseRef = useRef(true);
  const pausedRef = useRef(false);
  const warpRef = useRef(0);
  const resetRef = useRef(0);
  const [activeTarget, setActiveTarget] = useState<TargetId>("aurelia");
  const [cruising, setCruising] = useState(true);
  const [paused, setPaused] = useState(false);
  const [ready, setReady] = useState(false);
  const [webglError, setWebglError] = useState(false);

  const selectTarget = useCallback((id: TargetId) => {
    targetRef.current = id;
    setActiveTarget(id);
  }, []);

  const toggleCruise = useCallback(() => {
    cruiseRef.current = !cruiseRef.current;
    setCruising(cruiseRef.current);
  }, []);

  const togglePaused = useCallback(() => {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
  }, []);

  const triggerWarp = useCallback(() => {
    warpRef.current = 1;
  }, []);

  const resetView = useCallback(() => {
    targetRef.current = "aurelia";
    cruiseRef.current = true;
    resetRef.current += 1;
    setActiveTarget("aurelia");
    setCruising(true);
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
    scene.background = new THREE.Color(0x020208);
    scene.fog = new THREE.FogExp2(0x03030a, 0.012);

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

    renderer.setClearColor(0x020208, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.72;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.2 : 1.5));
    renderer.domElement.className = styles.canvas;
    renderer.domElement.dataset.testid = "galaxy-canvas";
    renderer.domElement.setAttribute("aria-hidden", "true");
    mount.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 180);
    camera.position.set(...SYSTEMS[0].camera);
    const currentLook = new THREE.Vector3(...SYSTEMS[0].look);
    camera.lookAt(currentLook);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloomBaseStrength = mobile ? 0.34 : 0.46;
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), bloomBaseStrength, 0.48, 0.38);
    composer.addPass(bloom);

    const universe = new THREE.Group();
    const galaxy = new THREE.Group();
    const system = new THREE.Group();
    scene.add(universe);
    universe.add(galaxy, system);

    const animatedMaterials: THREE.ShaderMaterial[] = [];
    const glowTexture = makeGlowTexture();

    function createPoints(kind: "galaxy" | "dust" | "background") {
      const count = kind === "galaxy" ? (mobile ? 15000 : 42000) : kind === "dust" ? (mobile ? 2600 : 8000) : (mobile ? 1800 : 5200);
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      const scales = new Float32Array(count);
      const phases = new Float32Array(count);
      const color = new THREE.Color();
      const inner = new THREE.Color(kind === "dust" ? 0xff7ad9 : 0xfff2cf);
      const middle = new THREE.Color(kind === "dust" ? 0x7a5cff : 0x68d8ff);
      const outer = new THREE.Color(kind === "dust" ? 0x405cff : 0x6952ff);
      const random = seededRandom(kind === "galaxy" ? 73117 : kind === "dust" ? 48163 : 19531);

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

    if (glowTexture) {
      const nebulae = [
        { position: [-8, 1, -8], color: 0x4a36ff, scale: 16 },
        { position: [9, -2, -11], color: 0x0f8dff, scale: 20 },
        { position: [1, 4, -15], color: 0xb638ff, scale: 13 },
        { position: [-2, -5, -9], color: 0xff347f, scale: 12 },
      ];
      nebulae.forEach((item) => {
        const material = new THREE.SpriteMaterial({
          map: glowTexture,
          color: item.color,
          transparent: true,
          opacity: 0.055,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        const sprite = new THREE.Sprite(material);
        sprite.position.set(item.position[0], item.position[1], item.position[2]);
        sprite.scale.setScalar(item.scale);
        galaxy.add(sprite);
      });
    }

    const ambientLight = new THREE.AmbientLight(0x243b72, 1.2);
    const keyLight = new THREE.DirectionalLight(0x9beaff, 4.2);
    keyLight.position.set(-8, 8, 10);
    const rimLight = new THREE.PointLight(0x7a3cff, 90, 32, 2);
    rimLight.position.set(2, 1, -2);
    scene.add(ambientLight, keyLight, rimLight);

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 40, 40),
      new THREE.MeshBasicMaterial({ color: 0xa8e7ff }),
    );
    core.position.set(0, 0, -0.5);
    galaxy.add(core);
    if (glowTexture) {
      const coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0x65c9ff,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }));
      coreGlow.position.copy(core.position);
      coreGlow.scale.setScalar(3.6);
      galaxy.add(coreGlow);
    }

    system.add(
      createOrbitLine(5.4, 4.2, 0x5db4ff, 0.11, 0.45),
      createOrbitLine(8.4, 6.6, 0x795cff, 0.09, -0.7),
      createOrbitLine(11.5, 9.2, 0xff5fa3, 0.065, 0.9),
    );

    const aurelia = new THREE.Group();
    aurelia.position.set(2.6, -0.35, 1.8);
    aurelia.rotation.z = -0.28;
    system.add(aurelia);

    const planetMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: planetVertexShader,
      fragmentShader: planetFragmentShader,
    });
    animatedMaterials.push(planetMaterial);
    const planet = new THREE.Mesh(new THREE.SphereGeometry(2.08, mobile ? 64 : 112, mobile ? 48 : 80), planetMaterial);
    aurelia.add(planet);

    const atmosphereMaterial = new THREE.ShaderMaterial({
      vertexShader: atmosphereVertexShader,
      fragmentShader: atmosphereFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
    });
    const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(2.23, 72, 56), atmosphereMaterial);
    aurelia.add(atmosphere);

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
          vec3 color = mix(vec3(0.16, 0.35, 0.58), vec3(0.5, 0.9, 1.0), stripe);
          float alpha = (0.1 + stripe * 0.22 + fine * 0.08) * edge;
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
    aurelia.add(rings);

    const moonOrbit = new THREE.Group();
    aurelia.add(moonOrbit);
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 32, 24),
      new THREE.MeshStandardMaterial({ color: 0xcbe6ff, roughness: 0.72, metalness: 0.05 }),
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
    nyx.position.set(-6.8, 1.4, -4);
    const nyxPlanet = new THREE.Mesh(
      new THREE.SphereGeometry(1.06, 64, 48),
      new THREE.MeshStandardMaterial({ color: 0x5f0b24, emissive: 0x6e0a25, emissiveIntensity: 0.38, roughness: 0.8 }),
    );
    nyx.add(nyxPlanet);
    addAtmosphere(nyx, 1.13, 0xff375f, 0.18);
    system.add(nyx);

    const caelum = new THREE.Group();
    caelum.position.set(6.4, 2.4, -5.5);
    const caelumPlanet = new THREE.Mesh(
      new THREE.SphereGeometry(1.42, 72, 52),
      new THREE.MeshPhysicalMaterial({
        color: 0x26317d,
        emissive: 0x182a7c,
        emissiveIntensity: 0.28,
        roughness: 0.28,
        metalness: 0.18,
        clearcoat: 0.72,
        clearcoatRoughness: 0.22,
      }),
    );
    caelum.add(caelumPlanet);
    addAtmosphere(caelum, 1.52, 0x7768ff, 0.16);
    const caelumRing = createOrbitLine(2.05, 2.05, 0x8d81ff, 0.26, 0.12);
    caelumRing.rotation.x = 0.35;
    caelum.add(caelumRing);
    system.add(caelum);

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
    let desiredCamera = new THREE.Vector3(...SYSTEMS[0].camera);
    let desiredLook = new THREE.Vector3(...SYSTEMS[0].look);
    let zoom = 1;
    let elapsed = 0;
    let frame = 0;
    let hidden = false;

    function applyTarget(id: TargetId) {
      const target = SYSTEMS.find((item) => item.id === id) ?? SYSTEMS[0];
      desiredCamera = new THREE.Vector3(...target.camera);
      desiredLook = new THREE.Vector3(...target.look);
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

    function resize() {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      composer.setSize(width, height);
      bloom.setSize(width, height);
      animatedMaterials.forEach((material) => {
        if (material.uniforms.uPixelRatio) material.uniforms.uPixelRatio.value = renderer.getPixelRatio();
      });
    }

    const resizeObserver = new ResizeObserver(resize);
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
      animatedMaterials.forEach((material) => {
        if (material.uniforms.uTime) material.uniforms.uTime.value = prefersReducedMotion ? 0 : elapsed;
        if (material.uniforms.uWarp) material.uniforms.uWarp.value = warp;
      });

      if (!pausedRef.current && !prefersReducedMotion) {
        galaxy.rotation.y = elapsed * 0.016;
        dust.rotation.y = -elapsed * 0.011;
        backgroundStars.rotation.y = elapsed * 0.0025;
        planet.rotation.y = elapsed * 0.085;
        moonOrbit.rotation.y = elapsed * 0.34;
        nyxPlanet.rotation.y = elapsed * 0.11;
        caelumPlanet.rotation.y = -elapsed * 0.072;
        system.rotation.y = Math.sin(elapsed * 0.07) * 0.025;
      }

      universe.rotation.y = THREE.MathUtils.lerp(universe.rotation.y, dragRotation.x + pointer.x * 0.045, 0.035);
      universe.rotation.x = THREE.MathUtils.lerp(universe.rotation.x, dragRotation.y - pointer.y * 0.025, 0.035);

      const targetCamera = desiredCamera.clone();
      if (cruiseRef.current && !prefersReducedMotion) {
        const radius = 0.42;
        targetCamera.x += Math.sin(elapsed * 0.12) * radius;
        targetCamera.y += Math.cos(elapsed * 0.09) * 0.22;
        targetCamera.z += Math.cos(elapsed * 0.12) * radius;
      }
      targetCamera.sub(desiredLook).multiplyScalar(zoom).add(desiredLook);
      targetCamera.x += pointer.x * 0.34;
      targetCamera.y += pointer.y * 0.2;
      camera.position.lerp(targetCamera, prefersReducedMotion ? 0.12 : 0.038);
      currentLook.lerp(desiredLook, 0.045);
      camera.lookAt(currentLook);
      camera.fov = THREE.MathUtils.lerp(camera.fov, 48 + warp * 15, 0.08);
      camera.updateProjectionMatrix();
      bloom.strength = bloomBaseStrength + warp * 0.42;
      composer.render();

      frame += 1;
      renderer.domElement.dataset.frame = String(frame);
      if (frame === 2) setReady(true);
    }

    animate();

    return () => {
      window.cancelAnimationFrame(animationFrame);
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
        if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line) {
          object.geometry?.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material?.dispose());
        }
      });
      glowTexture?.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      document.body.style.overflow = previousOverflow;
    };
  }, [resetView, selectTarget, toggleCruise]);

  const activeSystem = SYSTEMS.find((item) => item.id === activeTarget) ?? SYSTEMS[0];

  return (
    <main className={styles.page} data-testid="galaxy-page">
      <div ref={mountRef} className={styles.scene} data-testid="galaxy-scene" />
      <div className={styles.vignette} aria-hidden="true" />
      <div className={styles.scanline} aria-hidden="true" />

      <div className={`${styles.loader} ${ready ? styles.loaderHidden : ""}`} aria-hidden={ready}>
        <span className={styles.loaderMark}><i /><i /><i /></span>
        <strong>CALIBRATING STARFIELD</strong>
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
          <div><strong>ASTRA</strong><small>ZAOCHANG / CELESTIAL LAB</small></div>
        </div>
        <div className={styles.headerStatus}>
          <span><i /> LIVE FIELD</span>
          <b>SECTOR 07G</b>
        </div>
      </header>

      <section className={styles.hero}>
        <span className={styles.kicker}>REAL-TIME CELESTIAL INTERFACE / 2026</span>
        <h1>ASTRA</h1>
        <p>穿过静默的星尘。<br />让轨道、引力与光成为一种界面。</p>
        <div className={styles.heroSignal}><span /><small>DEEP FIELD SIGNAL</small><b>98.7%</b></div>
      </section>

      <nav className={styles.systemNav} aria-label="星体导航">
        {SYSTEMS.map((item) => (
          <button
            type="button"
            key={item.id}
            className={activeTarget === item.id ? styles.systemActive : ""}
            onClick={() => selectTarget(item.id)}
            aria-pressed={activeTarget === item.id}
          >
            <span style={{ color: item.accent }}>{item.index}</span>
            <strong>{item.name}</strong>
            <small>{item.type}</small>
            <i style={{ background: item.accent }} />
          </button>
        ))}
      </nav>

      <aside className={styles.telemetry} aria-live="polite">
        <span className={styles.telemetryLabel}>LOCKED OBJECT</span>
        <strong>{activeSystem.name}</strong>
        <div><span>CLASS</span><b>{activeSystem.type}</b></div>
        <div><span>DISTANCE</span><b>{activeSystem.distance}</b></div>
        <div><span>ORBIT</span><b>{cruising ? "AUTONOMOUS" : "MANUAL"}</b></div>
        <div><span>RENDER</span><b>{paused ? "HOLD" : "REALTIME"}</b></div>
        <i className={styles.telemetryRule}><span style={{ background: activeSystem.accent }} /></i>
      </aside>

      <div className={styles.controls} aria-label="星图控制">
        <button type="button" onClick={toggleCruise} className={cruising ? styles.controlActive : ""} title={cruising ? "关闭自动巡航" : "开启自动巡航"} aria-label={cruising ? "关闭自动巡航" : "开启自动巡航"}>
          <Orbit size={18} /><span>巡航</span>
        </button>
        <button type="button" onClick={togglePaused} title={paused ? "继续星图" : "暂停星图"} aria-label={paused ? "继续星图" : "暂停星图"}>
          {paused ? <Play size={18} /> : <Pause size={18} />}<span>{paused ? "继续" : "暂停"}</span>
        </button>
        <button type="button" onClick={triggerWarp} className={styles.warpControl} title="触发空间跃迁" aria-label="触发空间跃迁">
          <Sparkles size={18} /><span>跃迁</span>
        </button>
        <button type="button" onClick={resetView} title="重置视角" aria-label="重置视角">
          <RotateCcw size={18} /><span>复位</span>
        </button>
      </div>

      <div className={styles.coordinates} aria-hidden="true">
        <span>X 31.4207</span><span>Y 18.0721</span><span>Z 09.2188</span>
      </div>

      <div className={styles.cornerMarks} aria-hidden="true"><i /><i /><i /><i /></div>

      <div className={styles.mobileMeta}>
        <Gauge size={15} /><span>{activeSystem.name}</span><b>{activeSystem.distance}</b>
      </div>

      <button
        type="button"
        className={styles.fullscreen}
        onClick={toggleFullscreen}
        title="切换全屏"
        aria-label="切换全屏"
      >
        <Expand size={17} />
      </button>

      <p className={styles.srOnly}>实时三维银河系，包含螺旋星系、粒子星尘、环形行星与三颗可切换星体。</p>
    </main>
  );
}
