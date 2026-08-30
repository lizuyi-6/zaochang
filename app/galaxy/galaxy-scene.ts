// Galaxy 场景构建层(Q8a 从 galaxy-experience.tsx 逐字拆出):renderer/composer/camera、
// 对象图、材质/纹理、黑洞、4 颗宿主恒星、12 颗行星、轨道/拾取物、runtime map、视觉半径
// 与对象 dispose。不依赖 React;shader、坐标、颜色、随机种子与创建顺序与拆分前逐字一致。
// 交互/相机飞行/动画遥测状态仍在主组件,后续批次再拆。
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
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
  createOrbitLine,
  PLANET_SURFACE_INDEX,
  STELLAR_PROFILES,
} from "./galaxy-scene-assets";

export type StellarRuntime = {
  group: THREE.Group;
  surface: THREE.Mesh;
  corona: THREE.Sprite | null;
  baseCoronaOpacity: number;
  phase: number;
};

export type GalaxySpaceRuntime = { space: THREE.Group; visual: THREE.Group; planets: THREE.Group; star: THREE.Group };

export type BodyRuntime = { group: THREE.Group; cameraAnchor: THREE.Object3D; focusAnchor: THREE.Object3D };

export type GenericPlanetRuntime = {
  definition: PlanetStory;
  group: THREE.Group;
  visual: THREE.Group;
  mesh: THREE.Mesh;
  moonOrbit: THREE.Group;
};

export type GalaxySceneRuntime = {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  currentLook: THREE.Vector3;
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  bloomBaseStrength: number;
  universe: THREE.Group;
  galaxy: THREE.Group;
  system: THREE.Group;
  animatedMaterials: THREE.ShaderMaterial[];
  targetAccent: THREE.Color;
  targetFog: THREE.Color;
  rimLight: THREE.PointLight;
  blackHoleRoot: THREE.Group;
  eventHorizon: THREE.Mesh;
  accretionDisk: THREE.Mesh;
  lensedArcPlane: THREE.Mesh;
  eventMaskPlane: THREE.Mesh;
  horizonCrown: THREE.Points;
  overviewCameraAnchor: THREE.Object3D;
  overviewFocusAnchor: THREE.Object3D;
  galaxySpaces: Map<GalaxyId, GalaxySpaceRuntime>;
  stellarRuntimes: StellarRuntime[];
  bodies: Map<TargetId, BodyRuntime>;
  genericPlanetRuntimes: GenericPlanetRuntime[];
  visualRadiusByTarget: Map<TargetId, number>;
  pickables: Array<{ mesh: THREE.Mesh; id: TargetId }>;
  planetaryOrbitLines: THREE.LineLoop[];
  backgroundStars: THREE.Points;
  galaxyStars: THREE.Points;
  dust: THREE.Points;
  foregroundDust: THREE.Points;
  constellationGroup: THREE.Group;
  diffractionStars: THREE.Sprite[];
  lightEchoes: THREE.Line[];
  aurelia: THREE.Group;
  planet: THREE.Mesh;
  moonOrbit: THREE.Group;
  nyx: THREE.Group;
  nyxPlanet: THREE.Mesh;
  nyxDebris: THREE.Group;
  caelum: THREE.Group;
  caelumPlanet: THREE.Mesh;
  caelumHalo: THREE.Group;
  dispose: () => void;
};

// 构建整个三维场景。renderer 创建失败(无 WebGL 环境)时调用 onRendererError 并返回 null,
// 由调用方展示错误面板;此前/此后的页面副作用(overflow)都在本函数内对称处理。
export function createGalaxyScene({
  mount,
  mobile,
  canvasClassName,
  onRendererError,
}: {
  mount: HTMLDivElement;
  mobile: boolean;
  canvasClassName: string;
  onRendererError: () => void;
}): GalaxySceneRuntime | null {
  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";

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
    onRendererError();
    document.body.style.overflow = previousOverflow;
    return null;
  }

  renderer.setClearColor(0x020109, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.64;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1 : 1.35));
  renderer.domElement.className = canvasClassName;
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

  const stellarRuntimes: StellarRuntime[] = [];

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

  const galaxySpaces = new Map<GalaxyId, GalaxySpaceRuntime>();
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

  const bodies = new Map<TargetId, BodyRuntime>();
  bodies.set("singularity", { group: blackHoleRoot, cameraAnchor: overviewCameraAnchor, focusAnchor: overviewFocusAnchor });
  bodies.set("aurelia", { group: aurelia, cameraAnchor: aureliaView.cameraAnchor, focusAnchor: aureliaView.focusAnchor });
  bodies.set("nyx", { group: nyx, cameraAnchor: nyxView.cameraAnchor, focusAnchor: nyxView.focusAnchor });
  bodies.set("caelum", { group: caelum, cameraAnchor: caelumView.cameraAnchor, focusAnchor: caelumView.focusAnchor });

  const genericPlanetRuntimes: GenericPlanetRuntime[] = [];
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

  const pickables: Array<{ mesh: THREE.Mesh; id: TargetId }> = [
    { mesh: planet, id: "aurelia" },
    { mesh: nyxPlanet, id: "nyx" },
    { mesh: caelumPlanet, id: "caelum" },
    ...genericPlanetRuntimes.map((runtime) => ({ mesh: runtime.mesh, id: runtime.definition.id })),
    ...galaxyPickables,
  ];

  // 对象图 dispose:停止 RAF/移除监听器由调用方先做(它们持有本 runtime 的引用),
  // 之后按 对象 → geometry/material → texture → composer → renderer 的顺序释放。
  function dispose() {
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
  }

  return {
    scene,
    renderer,
    camera,
    currentLook,
    composer,
    bloom,
    bloomBaseStrength,
    universe,
    galaxy,
    system,
    animatedMaterials,
    targetAccent,
    targetFog,
    rimLight,
    blackHoleRoot,
    eventHorizon,
    accretionDisk,
    lensedArcPlane,
    eventMaskPlane,
    horizonCrown,
    overviewCameraAnchor,
    overviewFocusAnchor,
    galaxySpaces,
    stellarRuntimes,
    bodies,
    genericPlanetRuntimes,
    visualRadiusByTarget,
    pickables,
    planetaryOrbitLines,
    backgroundStars,
    galaxyStars,
    dust,
    foregroundDust,
    constellationGroup,
    diffractionStars,
    lightEchoes,
    aurelia,
    planet,
    moonOrbit,
    nyx,
    nyxPlanet,
    nyxDebris,
    caelum,
    caelumPlanet,
    caelumHalo,
    dispose,
  };
}
