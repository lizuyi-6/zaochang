"use client";

import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  GALAXIES,
  PLANET_BY_ID,
  PLANETS,
  PLANETS_BY_GALAXY,
  SINGULARITY,
  type GalaxyId,
  type PlanetId,
  type PlanetStory,
  type TargetId,
} from "./cosmic-atlas";
import {
  GALAXY_BUSINESS,
  PRODUCT_BY_PLANET,
} from "./product-galaxy";
import {
  GalaxyAccessibleSummary,
  GalaxyAtlasNav,
  GalaxyControls,
  GalaxyEcosystemNav,
  GalaxyHeader,
  GalaxyHero,
  GalaxyMobileIndex,
  GalaxyObservation,
  GalaxyOverlay,
} from "./galaxy-panels";
import styles from "./galaxy.module.css";
import {
  starVertexShader,
  starFragmentShader,
  stellarVertexShader,
  stellarFragmentShader,
  nebulaVertexShader,
  nebulaFragmentShader,
  planetVertexShader,
  planetFragmentShader,
  nyxFragmentShader,
  caelumFragmentShader,
  archivePlanetFragmentShader,
  accretionVertexShader,
  accretionFragmentShader,
  lensedArcVertexShader,
  lensedArcFragmentShader,
  atmosphereVertexShader,
  atmosphereFragmentShader,
  planetaryRingVertexShader,
  planetaryRingFragmentShader,
} from "./galaxy-shaders";
import {
  makeGlowTexture,
  makeDiffractionTexture,
  seededRandom,
  PLANET_ORBIT_DISTANCE_SCALE,
  PLANET_GALAXY_OFFSET,
  setOrbitalPosition,
  getOrbitResidual,
  cubicBezier,
  createOrbitLine,
  PLANET_SURFACE_INDEX,
  STELLAR_PROFILES,
} from "./galaxy-scene-assets";

export function GalaxyExperience() {
  const mountRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<TargetId>("singularity");
  const cruiseRef = useRef(true);
  const pausedRef = useRef(false);
  const warpRef = useRef(0);
  const passageRef = useRef(0);
  const quietRef = useRef(false);
  const resetRef = useRef(0);
  const [activeTarget, setActiveTarget] = useState<TargetId>("singularity");
  const [paused, setPaused] = useState(false);
  const [quiet, setQuiet] = useState(false);
  const [passageActive, setPassageActive] = useState(false);
  const [storyExpanded, setStoryExpanded] = useState(false);
  const [ready, setReady] = useState(false);
  const [webglError, setWebglError] = useState(false);

  const selectTarget = useCallback((id: TargetId) => {
    if (id !== "singularity" && targetRef.current === id) {
      setStoryExpanded((expanded) => !expanded);
      return;
    }
    targetRef.current = id;
    warpRef.current = 0.22;
    setStoryExpanded(false);
    setActiveTarget(id);
  }, []);

  const selectGalaxy = useCallback((id: GalaxyId) => {
    const firstPlanet = PLANETS_BY_GALAXY[id][0];
    if (!firstPlanet) return;
    if (targetRef.current === firstPlanet.id) {
      setStoryExpanded(false);
      return;
    }
    selectTarget(firstPlanet.id);
  }, [selectTarget]);

  const selectRandomPlanet = useCallback(() => {
    const choices = PLANETS.filter((planet) => planet.id !== targetRef.current);
    const next = choices[Math.floor(Math.random() * choices.length)] ?? PLANETS[0];
    if (next) selectTarget(next.id);
  }, [selectTarget]);

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
    targetRef.current = "singularity";
    cruiseRef.current = true;
    resetRef.current += 1;
    setStoryExpanded(false);
    setActiveTarget("singularity");
  }, []);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("planet") as PlanetId | null;
    // Object.hasOwn:`in` 会命中 Object.prototype 键,"?planet=constructor" 一旦混过
    // 校验,每帧取 PLANET_BY_ID[appliedTarget].visual 抛 TypeError,RAF 循环整体卡死。
    if (requested && Object.hasOwn(PLANET_BY_ID, requested)) selectTarget(requested);
  }, [selectTarget]);

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
      queueMicrotask(() => setWebglError(true));
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

    const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 360);
    camera.position.set(0, mobile ? 15 : 10.5, mobile ? 62 : 43);
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
    const targetAccent = new THREE.Color(SINGULARITY.accent);
    const targetFog = new THREE.Color(0x04030b).lerp(targetAccent, 0.045);

    const blackHoleRoot = new THREE.Group();
    const blackHoleVisual = new THREE.Group();
    blackHoleRoot.add(blackHoleVisual);
    universe.add(blackHoleRoot);

    const eventHorizon = new THREE.Mesh(
      new THREE.SphereGeometry(3.6, mobile ? 48 : 80, mobile ? 32 : 56),
      new THREE.MeshBasicMaterial({ color: 0x000000, depthWrite: true }),
    );
    eventHorizon.renderOrder = 8;
    blackHoleVisual.add(eventHorizon);

    const accretionMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPassage: { value: 0 } },
      vertexShader: accretionVertexShader,
      fragmentShader: accretionFragmentShader,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    animatedMaterials.push(accretionMaterial);
    const accretionDisk = new THREE.Mesh(
      new THREE.RingGeometry(3.7, 13.5, mobile ? 192 : 320, 1),
      accretionMaterial,
    );
    accretionDisk.rotation.set(1.13, 0.08, -0.24);
    accretionDisk.renderOrder = 4;
    blackHoleVisual.add(accretionDisk);

    const lensedArcMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPassage: { value: 0 } },
      vertexShader: lensedArcVertexShader,
      fragmentShader: lensedArcFragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    animatedMaterials.push(lensedArcMaterial);
    const lensedArcPlane = new THREE.Mesh(new THREE.PlaneGeometry(27, 27), lensedArcMaterial);
    lensedArcPlane.renderOrder = 10;
    lensedArcPlane.frustumCulled = false;
    scene.add(lensedArcPlane);

    const eventMaskPlane = new THREE.Mesh(
      new THREE.CircleGeometry(3.62, mobile ? 80 : 144),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 1,
        depthTest: false,
        depthWrite: false,
      }),
    );
    eventMaskPlane.renderOrder = 9;
    eventMaskPlane.frustumCulled = false;
    scene.add(eventMaskPlane);

    const crownCount = mobile ? 4800 : 14000;
    const crownPositions = new Float32Array(crownCount * 3);
    const crownColors = new Float32Array(crownCount * 3);
    const crownScales = new Float32Array(crownCount);
    const crownPhases = new Float32Array(crownCount);
    const crownRandom = seededRandom(193117);
    const crownColor = new THREE.Color();
    for (let index = 0; index < crownCount; index += 1) {
      const offset = index * 3;
      const angle = crownRandom() * Math.PI * 2;
      const radius = 16.2 + (crownRandom() - 0.5) * 2.3;
      const thickness = (crownRandom() - 0.5) * 1.15;
      crownPositions[offset] = Math.cos(angle) * radius;
      crownPositions[offset + 1] = thickness;
      crownPositions[offset + 2] = Math.sin(angle) * radius;
      crownColor.set(crownRandom() > 0.72 ? 0xffd79a : crownRandom() > 0.42 ? 0xd9b177 : 0x9d879f);
      crownColors[offset] = crownColor.r;
      crownColors[offset + 1] = crownColor.g;
      crownColors[offset + 2] = crownColor.b;
      crownScales[index] = 0.65 + crownRandom() * 2.1;
      crownPhases[index] = crownRandom() * Math.PI * 2;
    }
    const crownGeometry = new THREE.BufferGeometry();
    crownGeometry.setAttribute("position", new THREE.BufferAttribute(crownPositions, 3));
    crownGeometry.setAttribute("color", new THREE.BufferAttribute(crownColors, 3));
    crownGeometry.setAttribute("aScale", new THREE.BufferAttribute(crownScales, 1));
    crownGeometry.setAttribute("aPhase", new THREE.BufferAttribute(crownPhases, 1));
    const crownMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: renderer.getPixelRatio() },
        uWarp: { value: 0 },
        uPassage: { value: 0 },
        uMaxSize: { value: 4.6 },
      },
      vertexShader: starVertexShader,
      fragmentShader: starFragmentShader,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    animatedMaterials.push(crownMaterial);
    const horizonCrown = new THREE.Points(crownGeometry, crownMaterial);
    horizonCrown.rotation.set(-0.2, 0, 0.15);
    horizonCrown.frustumCulled = false;
    blackHoleVisual.add(horizonCrown);

    const overviewCameraAnchor = new THREE.Object3D();
    overviewCameraAnchor.position.set(0, mobile ? 15 : 10.5, mobile ? 62 : 43);
    const overviewFocusAnchor = new THREE.Object3D();
    overviewFocusAnchor.position.set(mobile ? 0 : -5.8, mobile ? -2.6 : -0.7, 0);
    blackHoleRoot.add(overviewCameraAnchor, overviewFocusAnchor);

    const stellarRuntimes: Array<{
      group: THREE.Group;
      surface: THREE.Mesh;
      corona: THREE.Sprite | null;
      baseCoronaOpacity: number;
      phase: number;
    }> = [];

    function createHostStar(galaxyId: GalaxyId, index: number) {
      const profile = STELLAR_PROFILES[galaxyId];
      const group = new THREE.Group();
      group.userData.hostStar = galaxyId;
      const material = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uSeed: { value: profile.seed },
          uColorA: { value: new THREE.Color(profile.colorA) },
          uColorB: { value: new THREE.Color(profile.colorB) },
          uCorona: { value: new THREE.Color(profile.corona) },
        },
        vertexShader: stellarVertexShader,
        fragmentShader: stellarFragmentShader,
      });
      animatedMaterials.push(material);
      const surface = new THREE.Mesh(
        new THREE.SphereGeometry(profile.radius, mobile ? 40 : 64, mobile ? 28 : 44),
        material,
      );
      group.add(surface);
      addAtmosphere(group, profile.radius * 1.1, profile.corona, galaxyId === "mnemora" ? 0.34 : 0.42);

      let corona: THREE.Sprite | null = null;
      const baseCoronaOpacity = galaxyId === "miralume" ? 0.46 : galaxyId === "mnemora" ? 0.34 : 0.4;
      if (glowTexture) {
        corona = new THREE.Sprite(new THREE.SpriteMaterial({
          map: glowTexture,
          color: profile.corona,
          transparent: true,
          opacity: baseCoronaOpacity,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }));
        corona.scale.setScalar(profile.radius * (galaxyId === "mnemora" ? 4.8 : 4.2));
        group.add(corona);
      }
      if (diffractionTexture && (galaxyId === "miralume" || galaxyId === "antevera")) {
        const diffraction = new THREE.Sprite(new THREE.SpriteMaterial({
          map: diffractionTexture,
          color: profile.colorA,
          transparent: true,
          opacity: galaxyId === "miralume" ? 0.16 : 0.1,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }));
        diffraction.scale.setScalar(profile.radius * (galaxyId === "miralume" ? 7.8 : 6.6));
        diffraction.material.rotation = index * 0.38;
        group.add(diffraction);
      }
      group.add(new THREE.PointLight(profile.colorA, profile.intensity, 58, 2));
      stellarRuntimes.push({ group, surface, corona, baseCoronaOpacity, phase: index * 1.7 + profile.seed });
      return group;
    }

    const galaxySpaces = new Map<GalaxyId, { space: THREE.Group; visual: THREE.Group; planets: THREE.Group; star: THREE.Group }>();
    const galaxyPickables: Array<{ mesh: THREE.Mesh; id: PlanetId }> = [];
    GALAXIES.forEach((definition, galaxyIndex) => {
      const space = new THREE.Group();
      space.position.set(...definition.position);
      const visual = new THREE.Group();
      visual.rotation.set((galaxyIndex - 1.5) * 0.13, galaxyIndex * 0.42, galaxyIndex % 2 ? -0.28 : 0.24);
      const planets = new THREE.Group();
      planets.position.copy(new THREE.Vector3(...definition.position).normalize().multiplyScalar(PLANET_GALAXY_OFFSET));
      const star = createHostStar(definition.id, galaxyIndex);
      planets.add(star);
      space.add(visual, planets);
      system.add(space);
      galaxySpaces.set(definition.id, { space, visual, planets, star });

      const count = mobile ? 420 : 1200;
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      const random = seededRandom(8147 + galaxyIndex * 9719);
      const innerColor = new THREE.Color(definition.accent);
      const outerColor = new THREE.Color(galaxyIndex % 2 ? 0x637ac2 : 0xb7d2e7);
      const mixed = new THREE.Color();
      for (let index = 0; index < count; index += 1) {
        const offset = index * 3;
        const radius = Math.pow(random(), 1.5) * 2.9;
        const arm = ((index % (galaxyIndex === 2 ? 2 : 4)) / (galaxyIndex === 2 ? 2 : 4)) * Math.PI * 2;
        const angle = arm + radius * (0.9 + galaxyIndex * 0.12) + (random() - 0.5) * 0.58;
        positions[offset] = Math.cos(angle) * radius;
        positions[offset + 1] = (random() - 0.5) * (0.24 + radius * 0.09);
        positions[offset + 2] = Math.sin(angle) * radius;
        mixed.copy(innerColor).lerp(outerColor, radius / 3.2);
        colors[offset] = mixed.r;
        colors[offset + 1] = mixed.g;
        colors[offset + 2] = mixed.b;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      const points = new THREE.Points(geometry, new THREE.PointsMaterial({
        size: mobile ? 0.035 : 0.05,
        vertexColors: true,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }));
      visual.add(points);
      if (glowTexture) {
        const coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({
          map: glowTexture,
          color: definition.accent,
          transparent: true,
          opacity: 0.38,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }));
        coreGlow.scale.setScalar(1.25);
        visual.add(coreGlow);
      }
      const proxy = new THREE.Mesh(
        new THREE.SphereGeometry(3.1, 16, 12),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }),
      );
      space.add(proxy);
      galaxyPickables.push({ mesh: proxy, id: PLANETS_BY_GALAXY[definition.id][0].id });
    });

    const planetaryOrbitLines: THREE.LineLoop[] = [];
    PLANETS.forEach((planetDefinition) => {
      const parent = galaxySpaces.get(planetDefinition.galaxyId)?.planets;
      if (parent) {
        const orbitLine = createOrbitLine(planetDefinition.orbit, PLANET_ORBIT_DISTANCE_SCALE);
        planetaryOrbitLines.push(orbitLine);
        parent.add(orbitLine);
      }
    });

    function createViewAnchors(parent: THREE.Group, target: PlanetStory) {
      const cameraAnchor = new THREE.Object3D();
      cameraAnchor.position.set(...(mobile ? target.mobileCameraOffset : target.cameraOffset));
      const focusAnchor = new THREE.Object3D();
      focusAnchor.position.set(...(mobile ? target.mobileFocusOffset : target.focusOffset));
      if (mobile) focusAnchor.position.y -= target.visual.radius > 1.8 ? 2.35 : 1.55;
      parent.add(cameraAnchor, focusAnchor);
      return { cameraAnchor, focusAnchor };
    }

    const aurelia = new THREE.Group();
    setOrbitalPosition(aurelia, PLANET_BY_ID.aurelia.orbit, 0, PLANET_ORBIT_DISTANCE_SCALE);
    galaxySpaces.get("origo")?.planets.add(aurelia);
    const aureliaView = createViewAnchors(aurelia, PLANET_BY_ID.aurelia);
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
      uniforms: {
        uColor: { value: new THREE.Color(PLANET_BY_ID.aurelia.visual.atmosphere) },
        uOpacity: { value: 0.48 },
      },
      vertexShader: atmosphereVertexShader,
      fragmentShader: atmosphereFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
    });
    const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(2.23, 72, 56), atmosphereMaterial);
    aureliaVisual.add(atmosphere);

    const rings = createPlanetaryRing(2.68, 4.35, 0xb8a78f, 1.1, [Math.PI / 2, 0, 0.08]);
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
      const material = new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(color) },
          uOpacity: { value: opacity },
        },
        vertexShader: atmosphereVertexShader,
        fragmentShader: atmosphereFragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
      });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 56, 40), material);
      parent.add(mesh);
    }

    function createPlanetaryRing(
      innerRadius: number,
      outerRadius: number,
      color: number,
      seed: number,
      tilt: [number, number, number],
    ) {
      const material = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uSeed: { value: seed },
          uInner: { value: innerRadius },
          uOuter: { value: outerRadius },
          uColor: { value: new THREE.Color(color) },
        },
        vertexShader: planetaryRingVertexShader,
        fragmentShader: planetaryRingFragmentShader,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      animatedMaterials.push(material);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(innerRadius, outerRadius, mobile ? 160 : 280, 1),
        material,
      );
      ring.rotation.set(...tilt);
      return ring;
    }

    const nyx = new THREE.Group();
    setOrbitalPosition(nyx, PLANET_BY_ID.nyx.orbit, 0, PLANET_ORBIT_DISTANCE_SCALE);
    const nyxView = createViewAnchors(nyx, PLANET_BY_ID.nyx);
    const nyxMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: planetVertexShader,
      fragmentShader: nyxFragmentShader,
    });
    animatedMaterials.push(nyxMaterial);
    const nyxPlanet = new THREE.Mesh(
      new THREE.SphereGeometry(1.06, 64, 48),
      nyxMaterial,
    );
    nyx.add(nyxPlanet);
    addAtmosphere(nyx, 1.14, 0xc8524c, 0.16);
    const nyxDebris = new THREE.Group();
    const nyxBelt = new THREE.Mesh(
      new THREE.TorusGeometry(1.48, 0.012, 6, 160),
      new THREE.MeshBasicMaterial({ color: 0xb45a4f, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending }),
    );
    nyxBelt.rotation.set(1.22, 0.28, -0.18);
    nyxDebris.add(nyxBelt);
    [
      [1.52, 0.18, 0.22, 0.1],
      [-1.18, -0.32, 0.92, 0.075],
      [0.48, 0.56, -1.34, 0.06],
    ].forEach(([x, y, z, scale], index) => {
      const shard = new THREE.Mesh(
        new THREE.IcosahedronGeometry(scale, 0),
        new THREE.MeshBasicMaterial({ color: index === 0 ? 0xe28d68 : 0x733238 }),
      );
      shard.position.set(x, y, z);
      nyxDebris.add(shard);
    });
    nyx.add(nyxDebris);
    galaxySpaces.get("origo")?.planets.add(nyx);

    const caelum = new THREE.Group();
    setOrbitalPosition(caelum, PLANET_BY_ID.caelum.orbit, 0, PLANET_ORBIT_DISTANCE_SCALE);
    const caelumView = createViewAnchors(caelum, PLANET_BY_ID.caelum);
    const caelumMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: planetVertexShader,
      fragmentShader: caelumFragmentShader,
    });
    animatedMaterials.push(caelumMaterial);
    const caelumPlanet = new THREE.Mesh(
      new THREE.SphereGeometry(1.42, 72, 52),
      caelumMaterial,
    );
    caelum.add(caelumPlanet);
    addAtmosphere(caelum, 1.53, 0x8fb9da, 0.16);
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
    const caelumHalo = new THREE.Group();
    const haloMaterial = new THREE.MeshBasicMaterial({ color: 0x86b6d9, transparent: true, opacity: 0.24, blending: THREE.AdditiveBlending });
    const caelumHaloOuter = new THREE.Mesh(new THREE.TorusGeometry(1.78, 0.012, 6, 180), haloMaterial);
    const caelumHaloInner = new THREE.Mesh(new THREE.TorusGeometry(1.64, 0.008, 6, 160), haloMaterial.clone());
    caelumHaloOuter.rotation.set(1.08, 0.26, 0.18);
    caelumHaloInner.rotation.set(1.32, -0.18, -0.28);
    caelumHalo.add(caelumHaloOuter, caelumHaloInner);
    caelum.add(caelumHalo);
    galaxySpaces.get("origo")?.planets.add(caelum);

    type BodyRuntime = { group: THREE.Group; cameraAnchor: THREE.Object3D; focusAnchor: THREE.Object3D };
    const bodies = new Map<TargetId, BodyRuntime>();
    bodies.set("singularity", { group: blackHoleRoot, cameraAnchor: overviewCameraAnchor, focusAnchor: overviewFocusAnchor });
    bodies.set("aurelia", { group: aurelia, cameraAnchor: aureliaView.cameraAnchor, focusAnchor: aureliaView.focusAnchor });
    bodies.set("nyx", { group: nyx, cameraAnchor: nyxView.cameraAnchor, focusAnchor: nyxView.focusAnchor });
    bodies.set("caelum", { group: caelum, cameraAnchor: caelumView.cameraAnchor, focusAnchor: caelumView.focusAnchor });

    const genericPlanetRuntimes: Array<{
      definition: PlanetStory;
      group: THREE.Group;
      visual: THREE.Group;
      mesh: THREE.Mesh;
      moonOrbit: THREE.Group;
    }> = [];
    PLANETS.slice(3).forEach((definition) => {
      const group = new THREE.Group();
      setOrbitalPosition(group, definition.orbit, 0, PLANET_ORBIT_DISTANCE_SCALE);
      const parent = galaxySpaces.get(definition.galaxyId)?.planets;
      if (parent) parent.add(group);
      const anchors = createViewAnchors(group, definition);
      const visual = new THREE.Group();
      visual.rotation.z = (definition.visual.seed % 1 - 0.5) * 0.7;
      group.add(visual);

      const material = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uSeed: { value: definition.visual.seed },
          uPattern: { value: definition.visual.pattern },
          uSurface: { value: PLANET_SURFACE_INDEX[definition.visual.surface] },
          uColorA: { value: new THREE.Color(definition.visual.colorA) },
          uColorB: { value: new THREE.Color(definition.visual.colorB) },
          uGlow: { value: new THREE.Color(definition.visual.glow) },
        },
        vertexShader: planetVertexShader,
        fragmentShader: archivePlanetFragmentShader,
      });
      animatedMaterials.push(material);
      let geometry: THREE.BufferGeometry;
      if (definition.visual.geometry === "crystal") {
        const crystalGeometry = new THREE.IcosahedronGeometry(definition.visual.radius, mobile ? 2 : 3);
        geometry = crystalGeometry.index ? crystalGeometry.toNonIndexed() : crystalGeometry;
        if (geometry !== crystalGeometry) crystalGeometry.dispose();
        geometry.computeVertexNormals();
      } else {
        geometry = new THREE.SphereGeometry(definition.visual.radius, mobile ? 44 : 72, mobile ? 30 : 52);
      }
      const mesh = new THREE.Mesh(geometry, material);
      visual.add(mesh);
      addAtmosphere(visual, definition.visual.radius * 1.075, definition.visual.atmosphere, 0.14);

      if (definition.visual.ringColor && definition.visual.ringScale) {
        const outerRadius = definition.visual.radius * definition.visual.ringScale;
        const innerScale = 1.08 + Math.min(0.22, (definition.visual.ringScale - 1.08) * 0.35);
        const ring = createPlanetaryRing(
          definition.visual.radius * innerScale,
          outerRadius,
          definition.visual.ringColor,
          definition.visual.seed,
          definition.visual.ringTilt ?? [1.22, 0.12, -0.18],
        );
        visual.add(ring);
      }

      const moonOrbit = new THREE.Group();
      visual.add(moonOrbit);
      for (let moonIndex = 0; moonIndex < (definition.visual.moons ?? 0); moonIndex += 1) {
        const moonRadius = definition.visual.radius * (0.07 + moonIndex * 0.012);
        const satellite = new THREE.Mesh(
          new THREE.IcosahedronGeometry(moonRadius, 1),
          new THREE.MeshStandardMaterial({
            color: new THREE.Color(definition.visual.glow).lerp(new THREE.Color(0x5d6070), 0.55),
            roughness: 0.82,
            metalness: 0.03,
          }),
        );
        const angle = (moonIndex / Math.max(1, definition.visual.moons ?? 1)) * Math.PI * 2 + definition.visual.seed;
        const orbitRadius = definition.visual.radius * (1.55 + moonIndex * 0.34);
        satellite.position.set(Math.cos(angle) * orbitRadius, (moonIndex - 1) * moonRadius * 2.2, Math.sin(angle) * orbitRadius);
        moonOrbit.add(satellite);
      }

      bodies.set(definition.id, { group, cameraAnchor: anchors.cameraAnchor, focusAnchor: anchors.focusAnchor });
      genericPlanetRuntimes.push({ definition, group, visual, mesh, moonOrbit });
    });

    const visualRadiusByTarget = new Map<TargetId, number>([
      ["singularity", 3.6],
      ["aurelia", 4.35],
      ["nyx", 1.62],
      ["caelum", 2.08],
    ]);
    genericPlanetRuntimes.forEach(({ definition }) => {
      visualRadiusByTarget.set(
        definition.id,
        Math.max(definition.visual.radius, definition.visual.radius * (definition.visual.ringScale ?? 1)),
      );
    });

    universe.updateMatrixWorld(true);
    overviewCameraAnchor.getWorldPosition(camera.position);
    overviewFocusAnchor.getWorldPosition(currentLook);
    camera.lookAt(currentLook);

    const pointer = new THREE.Vector2();
    const raycaster = new THREE.Raycaster();
    const pickables: Array<{ mesh: THREE.Mesh; id: TargetId }> = [
      { mesh: planet, id: "aurelia" },
      { mesh: nyxPlanet, id: "nyx" },
      { mesh: caelumPlanet, id: "caelum" },
      ...genericPlanetRuntimes.map((runtime) => ({ mesh: runtime.mesh, id: runtime.definition.id })),
      ...galaxyPickables,
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
    const projectedBlackHole = new THREE.Vector3();
    const projectedHostStar = new THREE.Vector3();
    const projectedHostStarEdge = new THREE.Vector3();
    const projectedEdge = new THREE.Vector3();
    const worldCenter = new THREE.Vector3();
    const blackHoleWorld = new THREE.Vector3();
    const planetWorldPositions = PLANETS.map(() => new THREE.Vector3());
    const starWorldPositions = new Map<GalaxyId, THREE.Vector3>(GALAXIES.map((definition) => [definition.id, new THREE.Vector3()]));
    const cameraAxis = new THREE.Vector3();
    let activeBody = bodies.get(targetRef.current) ?? bodies.get("singularity")!;
    type CameraFlight = {
      fromId: TargetId;
      toId: TargetId;
      startedAt: number;
      duration: number;
      startCamera: THREE.Vector3;
      startLook: THREE.Vector3;
      controlA: THREE.Vector3;
      controlB: THREE.Vector3;
    };
    let cameraFlight: CameraFlight | null = null;
    const flightCamera = new THREE.Vector3();
    const flightDirection = new THREE.Vector3();
    const flightSide = new THREE.Vector3();
    const flightUp = new THREE.Vector3(0, 1, 0);
    let zoom = 1;
    let elapsed = 0;
    let passage = 0;
    let frame = 0;
    let hidden = false;

    function setFocusVisibility(id: TargetId, previousId: TargetId | null = null, flying = false) {
      const expandedUniverseVisible = id !== "singularity" || flying;
      const atlasVisible = id === "singularity" || (flying && previousId === "singularity");
      const activeGalaxyId = id === "singularity" ? null : PLANET_BY_ID[id].galaxyId;

      galaxySpaces.forEach((runtime, galaxyId) => {
        runtime.planets.visible = expandedUniverseVisible;
        runtime.visual.visible = atlasVisible;
        runtime.visual.scale.setScalar(atlasVisible ? 1.65 : activeGalaxyId === galaxyId ? 0.72 : 0.9);
      });
      PLANETS.forEach((definition) => {
        const runtime = bodies.get(definition.id);
        if (runtime) runtime.group.visible = expandedUniverseVisible;
      });
      eventHorizon.visible = true;
      accretionDisk.visible = true;
      eventMaskPlane.visible = true;
      lensedArcPlane.visible = true;
      horizonCrown.visible = true;
      galaxy.visible = atlasVisible;
      foregroundDust.visible = atlasVisible;
      planetaryOrbitLines.forEach((line) => { line.visible = false; });
    }

    function applyTarget(id: TargetId, startedAt?: number) {
      const previousId = appliedTarget;
      const target = id === "singularity" ? SINGULARITY : PLANET_BY_ID[id];
      activeBody = bodies.get(id) ?? bodies.get("singularity")!;
      const shouldFly = startedAt !== undefined && previousId !== id && frame > 0 && !prefersReducedMotion;
      if (shouldFly) {
        universe.updateMatrixWorld(true);
        activeBody.cameraAnchor.getWorldPosition(targetCamera);
        activeBody.focusAnchor.getWorldPosition(targetLook);
        const isolationDistance = id === "singularity" ? 1 : mobile ? 1.1 : 1.16;
        targetCamera.sub(targetLook).multiplyScalar(zoom * isolationDistance).add(targetLook);
        flightDirection.copy(targetCamera).sub(camera.position);
        const distance = flightDirection.length();
        flightSide.copy(flightDirection).cross(flightUp);
        if (flightSide.lengthSq() < 0.0001) flightSide.set(1, 0, 0);
        else flightSide.normalize();
        const lift = THREE.MathUtils.clamp(distance * 0.1, 4.5, 20);
        const bend = THREE.MathUtils.clamp(distance * 0.045, 2.5, 12) * (previousId < id ? 1 : -1);
        cameraFlight = {
          fromId: previousId,
          toId: id,
          startedAt,
          duration: THREE.MathUtils.clamp(2500 + distance * 18, 2800, 5200),
          startCamera: camera.position.clone(),
          startLook: currentLook.clone(),
          controlA: camera.position.clone().addScaledVector(flightDirection, 0.28).addScaledVector(flightUp, lift).addScaledVector(flightSide, bend),
          controlB: camera.position.clone().addScaledVector(flightDirection, 0.72).addScaledVector(flightUp, lift * 0.62).addScaledVector(flightSide, -bend * 0.3),
        };
        setFocusVisibility(id, previousId, true);
      } else {
        cameraFlight = null;
        setFocusVisibility(id);
      }
      targetAccent.set(target.accent);
      targetFog.set(0x04030b).lerp(targetAccent, 0.045);
      appliedTarget = id;
    }

    applyTarget(targetRef.current);

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
      if (event.key === "0") selectTarget("singularity");
      if (/^[1-4]$/.test(event.key)) {
        if (targetRef.current === "singularity") {
          const galaxy = GALAXIES[Number(event.key) - 1];
          const firstPlanet = galaxy ? PLANETS_BY_GALAXY[galaxy.id][0] : undefined;
          if (firstPlanet) selectTarget(firstPlanet.id);
        } else {
          const activePlanet = PLANET_BY_ID[targetRef.current];
          const sibling = PLANETS_BY_GALAXY[activePlanet.galaxyId][Number(event.key) - 1];
          if (sibling) selectTarget(sibling.id);
        }
      }
      if (event.key === "Escape") selectTarget("singularity");
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
    let compactScene = mobile;

    function resize() {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      if (width === renderedWidth && height === renderedHeight) return;
      renderedWidth = width;
      renderedHeight = height;
      const nextCompactScene = width <= 720;
      if (nextCompactScene !== compactScene) {
        compactScene = nextCompactScene;
        overviewCameraAnchor.position.set(0, compactScene ? 15 : 10.5, compactScene ? 62 : 43);
        overviewFocusAnchor.position.set(compactScene ? 0 : -5.8, compactScene ? -2.6 : -0.7, 0);
        PLANETS.forEach((definition) => {
          const runtime = bodies.get(definition.id);
          runtime?.cameraAnchor.position.set(...(compactScene ? definition.mobileCameraOffset : definition.cameraOffset));
          runtime?.focusAnchor.position.set(...(compactScene ? definition.mobileFocusOffset : definition.focusOffset));
        });
      }
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

      if (targetRef.current !== appliedTarget) applyTarget(targetRef.current, timestamp);
      if (resetRef.current !== appliedReset) {
        appliedReset = resetRef.current;
        dragRotation.set(0, 0);
        zoom = 1;
        applyTarget("singularity", timestamp);
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
        setOrbitalPosition(aurelia, PLANET_BY_ID.aurelia.orbit, elapsed, PLANET_ORBIT_DISTANCE_SCALE);
        setOrbitalPosition(nyx, PLANET_BY_ID.nyx.orbit, elapsed, PLANET_ORBIT_DISTANCE_SCALE);
        setOrbitalPosition(caelum, PLANET_BY_ID.caelum.orbit, elapsed, PLANET_ORBIT_DISTANCE_SCALE);
        genericPlanetRuntimes.forEach((runtime, index) => {
          setOrbitalPosition(runtime.group, runtime.definition.orbit, elapsed, PLANET_ORBIT_DISTANCE_SCALE);
          runtime.visual.rotation.y = (index % 2 ? -1 : 1) * elapsed * (0.018 + (runtime.definition.visual.seed % 1) * 0.02) * quietMotion;
          runtime.moonOrbit.rotation.y = elapsed * (0.055 + index * 0.002) * quietMotion;
        });
        galaxy.rotation.y = elapsed * 0.004 * quietMotion;
        dust.rotation.y = -elapsed * 0.003 * quietMotion;
        horizonCrown.rotation.y = elapsed * 0.0035 * quietMotion;
        horizonCrown.rotation.z = 0.15 + Math.sin(elapsed * 0.008) * 0.018 * quietMotion;
        galaxySpaces.forEach((runtime, id) => {
          const index = GALAXIES.findIndex((galaxyDefinition) => galaxyDefinition.id === id);
          runtime.visual.rotation.y += (0.00016 + index * 0.000025) * quietMotion;
        });
        backgroundStars.rotation.y = elapsed * 0.0012 * quietMotion;
        foregroundDust.position.z = Math.sin(elapsed * 0.028) * 0.42 * quietMotion;
        constellationGroup.rotation.y = Math.sin(elapsed * 0.018) * 0.012;
        planet.rotation.y = elapsed * 0.026 * quietMotion;
        moonOrbit.rotation.y = elapsed * 0.11 * quietMotion;
        nyxPlanet.rotation.y = elapsed * 0.034 * quietMotion;
        nyxDebris.rotation.y = elapsed * 0.052 * quietMotion;
        nyxDebris.rotation.z = Math.sin(elapsed * 0.027) * 0.08;
        caelumPlanet.rotation.y = -elapsed * 0.024 * quietMotion;
        caelumHalo.rotation.y = -elapsed * 0.031 * quietMotion;
        caelumHalo.rotation.z = Math.sin(elapsed * 0.021) * 0.06;
        stellarRuntimes.forEach((runtime, index) => {
          runtime.surface.rotation.y = elapsed * (0.012 + index * 0.0035) * quietMotion;
          runtime.surface.rotation.z = Math.sin(elapsed * 0.009 + runtime.phase) * 0.035;
          if (runtime.corona) {
            (runtime.corona.material as THREE.SpriteMaterial).opacity = runtime.baseCoronaOpacity * (0.9 + Math.sin(elapsed * 0.21 + runtime.phase) * 0.1);
          }
        });
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
      if (!cameraFlight && cruiseRef.current && !prefersReducedMotion) {
        const radius = quietRef.current ? 0.05 : 0.12;
        targetCamera.x += Math.sin(elapsed * 0.07) * radius;
        targetCamera.y += Math.cos(elapsed * 0.052) * radius * 0.55;
        targetCamera.z += Math.cos(elapsed * 0.07) * radius;
      }
      const isolationDistance = appliedTarget === "singularity" ? 1 : mobile ? 1.1 : 1.16;
      targetCamera.sub(targetLook).multiplyScalar(zoom * isolationDistance).add(targetLook);
      if (!cameraFlight) {
        targetCamera.x += pointer.x * 0.22 * quietMotion;
        targetCamera.y += pointer.y * 0.13 * quietMotion;
      }
      let transitionProgress = 1;
      let flightFov = 0;
      if (cameraFlight) {
        const rawProgress = THREE.MathUtils.clamp((timestamp - cameraFlight.startedAt) / cameraFlight.duration, 0, 1);
        transitionProgress = rawProgress;
        const easedProgress = rawProgress * rawProgress * (3 - 2 * rawProgress);
        cubicBezier(
          flightCamera,
          cameraFlight.startCamera,
          cameraFlight.controlA,
          cameraFlight.controlB,
          targetCamera,
          easedProgress,
        );
        camera.position.copy(flightCamera);
        currentLook.lerpVectors(cameraFlight.startLook, targetLook, easedProgress);
        flightFov = Math.sin(Math.PI * rawProgress) * 7;
        if (rawProgress >= 1) {
          camera.position.copy(targetCamera);
          currentLook.copy(targetLook);
          setFocusVisibility(cameraFlight.toId);
          cameraFlight = null;
        }
      } else {
        camera.position.lerp(targetCamera, prefersReducedMotion ? 0.16 : 0.045);
        currentLook.lerp(targetLook, prefersReducedMotion ? 0.16 : 0.052);
      }
      camera.lookAt(currentLook);
      blackHoleRoot.getWorldPosition(lensedArcPlane.position);
      lensedArcPlane.quaternion.copy(camera.quaternion);
      eventMaskPlane.position.copy(lensedArcPlane.position);
      eventMaskPlane.quaternion.copy(camera.quaternion);
      const baseFov = appliedTarget === "singularity" ? (compactScene ? 58 : 54) : 48;
      camera.fov = THREE.MathUtils.lerp(camera.fov, baseFov + warp * 6 + passage * 9 + flightFov, cameraFlight ? 0.14 : 0.06);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      activeBody.group.getWorldPosition(projectedTarget).project(camera);
      blackHoleRoot.getWorldPosition(projectedBlackHole).project(camera);
      activeBody.group.getWorldPosition(worldCenter);
      cameraAxis.set(1, 0, 0).applyQuaternion(camera.quaternion).multiplyScalar(visualRadiusByTarget.get(appliedTarget) ?? 1);
      projectedEdge.copy(worldCenter).add(cameraAxis).project(camera);
      const targetRadiusPx = Math.abs(projectedEdge.x - projectedTarget.x) * renderedWidth * 0.5;
      const targetCenterPx = (projectedTarget.x + 1) * renderedWidth * 0.5;
      blackHoleRoot.getWorldPosition(worldCenter);
      cameraAxis.set(1, 0, 0).applyQuaternion(camera.quaternion).multiplyScalar(3.6);
      projectedEdge.copy(worldCenter).add(cameraAxis).project(camera);
      const blackHoleRadiusPx = Math.abs(projectedEdge.x - projectedBlackHole.x) * renderedWidth * 0.5;
      cameraAxis.set(1, 0, 0).applyQuaternion(camera.quaternion).multiplyScalar(17.35);
      projectedEdge.copy(worldCenter).add(cameraAxis).project(camera);
      const crownOuterRadiusPx = Math.abs(projectedEdge.x - projectedBlackHole.x) * renderedWidth * 0.5;
      cameraAxis.set(1, 0, 0).applyQuaternion(camera.quaternion).multiplyScalar(15.05);
      projectedEdge.copy(worldCenter).add(cameraAxis).project(camera);
      const crownInnerRadiusPx = Math.abs(projectedEdge.x - projectedBlackHole.x) * renderedWidth * 0.5;
      renderer.domElement.dataset.target = appliedTarget;
      renderer.domElement.dataset.focusKind = appliedTarget === "singularity" ? "singularity" : "planet";
      renderer.domElement.dataset.lensingMode = "lensed-arcs";
      renderer.domElement.dataset.sceneDensity = appliedTarget === "singularity" ? "atlas" : "solitude";
      renderer.domElement.dataset.cameraTransition = cameraFlight ? "flying" : "settled";
      renderer.domElement.dataset.transitionProgress = transitionProgress.toFixed(4);
      renderer.domElement.dataset.transitionFrom = cameraFlight?.fromId ?? appliedTarget;
      renderer.domElement.dataset.transitionTo = cameraFlight?.toId ?? appliedTarget;
      renderer.domElement.dataset.cameraX = camera.position.x.toFixed(4);
      renderer.domElement.dataset.cameraY = camera.position.y.toFixed(4);
      renderer.domElement.dataset.cameraZ = camera.position.z.toFixed(4);
      renderer.domElement.dataset.surfaceFamily = appliedTarget === "singularity" ? "singularity" : PLANET_BY_ID[appliedTarget].visual.surface;
      renderer.domElement.dataset.parentGalaxy = appliedTarget === "singularity" ? "none" : PLANET_BY_ID[appliedTarget].galaxyId;
      renderer.domElement.dataset.galaxyCount = String(GALAXIES.length);
      renderer.domElement.dataset.planetCount = String(PLANETS.length);
      renderer.domElement.dataset.visiblePlanetCount = String(PLANETS.filter((definition) => bodies.get(definition.id)?.group.visible).length);
      renderer.domElement.dataset.hostStarCount = String(stellarRuntimes.length);
      renderer.domElement.dataset.visibleHostStarCount = String(Array.from(galaxySpaces.values()).filter((runtime) => runtime.planets.visible && runtime.star.visible).length);
      PLANETS.forEach((definition, index) => bodies.get(definition.id)?.group.getWorldPosition(planetWorldPositions[index]));
      galaxySpaces.forEach((runtime, galaxyId) => runtime.star.getWorldPosition(starWorldPositions.get(galaxyId)!));
      let minimumPlanetSeparation = Number.POSITIVE_INFINITY;
      for (let first = 0; first < planetWorldPositions.length; first += 1) {
        for (let second = first + 1; second < planetWorldPositions.length; second += 1) {
          minimumPlanetSeparation = Math.min(minimumPlanetSeparation, planetWorldPositions[first].distanceTo(planetWorldPositions[second]));
        }
      }
      blackHoleRoot.getWorldPosition(blackHoleWorld);
      const activePlanetIndex = appliedTarget === "singularity" ? -1 : PLANETS.findIndex((definition) => definition.id === appliedTarget);
      const activeHostStar = appliedTarget === "singularity" ? null : starWorldPositions.get(PLANET_BY_ID[appliedTarget].galaxyId);
      let hostStarRadiusPx = 0;
      if (activeHostStar && appliedTarget !== "singularity") {
        projectedHostStar.copy(activeHostStar).project(camera);
        cameraAxis.set(1, 0, 0).applyQuaternion(camera.quaternion).multiplyScalar(STELLAR_PROFILES[PLANET_BY_ID[appliedTarget].galaxyId].radius);
        projectedHostStarEdge.copy(activeHostStar).add(cameraAxis).project(camera);
        hostStarRadiusPx = Math.abs(projectedHostStarEdge.x - projectedHostStar.x) * renderedWidth * 0.5;
      } else {
        projectedHostStar.set(2, 2, 2);
      }
      renderer.domElement.dataset.minimumPlanetSeparation = minimumPlanetSeparation.toFixed(2);
      renderer.domElement.dataset.targetBlackHoleDistance = activePlanetIndex < 0 ? "0.00" : planetWorldPositions[activePlanetIndex].distanceTo(blackHoleWorld).toFixed(2);
      renderer.domElement.dataset.targetHostStarDistance = activePlanetIndex < 0 || !activeHostStar ? "0.00" : planetWorldPositions[activePlanetIndex].distanceTo(activeHostStar).toFixed(2);
      renderer.domElement.dataset.hostStarNdcX = projectedHostStar.x.toFixed(4);
      renderer.domElement.dataset.hostStarNdcY = projectedHostStar.y.toFixed(4);
      renderer.domElement.dataset.hostStarRadiusPx = hostStarRadiusPx.toFixed(2);
      renderer.domElement.dataset.targetNdcX = projectedTarget.x.toFixed(4);
      renderer.domElement.dataset.targetNdcY = projectedTarget.y.toFixed(4);
      renderer.domElement.dataset.targetRadiusPx = targetRadiusPx.toFixed(2);
      renderer.domElement.dataset.targetLeftPx = (targetCenterPx - targetRadiusPx).toFixed(2);
      renderer.domElement.dataset.cameraResidual = camera.position.distanceTo(targetCamera).toFixed(4);
      renderer.domElement.dataset.blackHoleNdcX = projectedBlackHole.x.toFixed(4);
      renderer.domElement.dataset.blackHoleNdcY = projectedBlackHole.y.toFixed(4);
      renderer.domElement.dataset.blackHoleRadiusPx = blackHoleRadiusPx.toFixed(2);
      renderer.domElement.dataset.crownInnerRadiusPx = crownInnerRadiusPx.toFixed(2);
      renderer.domElement.dataset.crownOuterRadiusPx = crownOuterRadiusPx.toFixed(2);
      renderer.domElement.dataset.blackHoleVisible = String(appliedTarget === "singularity" && Math.abs(projectedBlackHole.x) < 1.15 && Math.abs(projectedBlackHole.y) < 1.15 && projectedBlackHole.z > -1 && projectedBlackHole.z < 1);
      renderer.domElement.dataset.blackHoleLayerVisible = String(eventHorizon.visible);
      renderer.domElement.dataset.orbitResidual = Math.max(...PLANETS.map((definition) => {
        const runtime = bodies.get(definition.id);
        return runtime ? getOrbitResidual(runtime.group, definition.orbit, PLANET_ORBIT_DISTANCE_SCALE) : Number.POSITIVE_INFINITY;
      })).toExponential(2);
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

  const activePlanet = activeTarget === "singularity" ? null : PLANET_BY_ID[activeTarget];
  const activeGalaxy = activePlanet ? GALAXIES.find((galaxy) => galaxy.id === activePlanet.galaxyId) ?? null : null;
  const activeBusiness = activeGalaxy ? GALAXY_BUSINESS[activeGalaxy.id] : null;
  const activeProduct = activePlanet ? PRODUCT_BY_PLANET[activePlanet.id] : null;
  const activeStory = activePlanet ?? SINGULARITY;
  const siblingPlanets = activeGalaxy ? PLANETS_BY_GALAXY[activeGalaxy.id] : [];

  return (
    <main
      className={`${styles.page} ${activeTarget === "singularity" ? styles.overview : ""} ${quiet ? styles.quiet : ""} ${passageActive ? styles.passageActive : ""}`}
      data-testid="galaxy-page"
      data-mode={activeTarget === "singularity" ? "overview" : "planet"}
      data-story-mode={storyExpanded ? "archive" : "short"}
      data-product-status={activeProduct?.status ?? "company-core"}
    >
      <div ref={mountRef} className={styles.scene} data-testid="galaxy-scene" />
      <GalaxyOverlay ready={ready} webglError={webglError} />

      <GalaxyHeader />

      <GalaxyEcosystemNav />

      <GalaxyHero
        storyExpanded={storyExpanded}
        activeStory={activeStory}
        activeProduct={activeProduct}
        activeBusiness={activeBusiness}
        activePlanet={activePlanet}
        onToggleStory={() => setStoryExpanded((expanded) => !expanded)}
        onSelectGalaxy={selectGalaxy}
        onSelectRandomPlanet={selectRandomPlanet}
      />

      {activeTarget === "singularity" && (
        <GalaxyMobileIndex onSelectGalaxy={selectGalaxy} />
      )}

      <GalaxyAtlasNav
        activeTarget={activeTarget}
        activeGalaxy={activeGalaxy}
        siblingPlanets={siblingPlanets}
        onSelectTarget={selectTarget}
        onSelectGalaxy={selectGalaxy}
      />

      <GalaxyObservation activeProduct={activeProduct} activeBusiness={activeBusiness} />

      <GalaxyControls
        paused={paused}
        quiet={quiet}
        passageActive={passageActive}
        onTogglePaused={togglePaused}
        onToggleQuiet={toggleQuiet}
        onStartPassage={startPassage}
        onStopPassage={stopPassage}
        onToggleFullscreen={toggleFullscreen}
      />

      <p className={styles.temporalEcho}>见界环保存的不是答案，而是文明曾认真问过的问题。</p>

      <GalaxyAccessibleSummary />
    </main>
  );
}
