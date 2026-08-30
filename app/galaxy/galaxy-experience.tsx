"use client";

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
import { createGalaxyScene } from "./galaxy-scene";
import { createCameraController } from "./galaxy-camera";
import styles from "./galaxy.module.css";
import {
  PLANET_ORBIT_DISTANCE_SCALE,
  setOrbitalPosition,
  getOrbitResidual,
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

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mobile = window.matchMedia("(max-width: 720px)").matches;

    const sceneRuntime = createGalaxyScene({
      mount,
      mobile,
      canvasClassName: styles.canvas,
      onRendererError: () => queueMicrotask(() => setWebglError(true)),
    });
    if (!sceneRuntime) return;
    const {
      scene, renderer, camera, composer, bloom, bloomBaseStrength,
      universe, galaxy, system, animatedMaterials, targetAccent, targetFog, rimLight,
      blackHoleRoot, eventHorizon, horizonCrown,
      overviewCameraAnchor, overviewFocusAnchor, galaxySpaces, stellarRuntimes, bodies,
      genericPlanetRuntimes, visualRadiusByTarget, pickables,
      backgroundStars, dust, foregroundDust, constellationGroup,
      diffractionStars, lightEchoes, aurelia, planet, moonOrbit,
      nyx, nyxPlanet, nyxDebris, caelum, caelumPlanet, caelumHalo,
    } = sceneRuntime;
    const pointer = new THREE.Vector2();
    const raycaster = new THREE.Raycaster();
    const dragRotation = new THREE.Vector2();
    let dragging = false;
    let dragX = 0;
    let dragY = 0;
    let dragDistance = 0;
    let appliedReset = resetRef.current;
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
    const cameraController = createCameraController({ runtime: sceneRuntime, mobile, prefersReducedMotion });
    let elapsed = 0;
    let passage = 0;
    let frame = 0;
    let hidden = false;

    cameraController.applyTarget(targetRef.current);

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
      cameraController.zoom = THREE.MathUtils.clamp(cameraController.zoom + event.deltaY * 0.00045, 0.76, 1.28);
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
      const targetChanged = targetRef.current !== cameraController.appliedTarget || resetRef.current !== appliedReset;
      const minimumFrameInterval = pausedRef.current || prefersReducedMotion ? 120 : 16;
      if (!targetChanged && timestamp - lastRenderTime < minimumFrameInterval) return;
      lastRenderTime = timestamp;
      const delta = previousFrameTime === 0 ? 0 : Math.min((timestamp - previousFrameTime) / 1000, 0.05);
      previousFrameTime = timestamp;
      if (!pausedRef.current) elapsed += delta;

      if (targetRef.current !== cameraController.appliedTarget) cameraController.applyTarget(targetRef.current, timestamp, frame);
      if (resetRef.current !== appliedReset) {
        appliedReset = resetRef.current;
        dragRotation.set(0, 0);
        cameraController.zoom = 1;
        cameraController.applyTarget("singularity", timestamp, frame);
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

      const { transitionProgress } = cameraController.updateCameraFrame({
        timestamp,
        elapsed,
        quiet: quietRef.current,
        quietMotion,
        cruising: cruiseRef.current,
        pointer,
        warp,
        passage,
        compactScene,
      });
      const appliedTarget = cameraController.appliedTarget;
      const activeBody = cameraController.activeBody;
      const cameraFlight = cameraController.cameraFlight;
      const targetCamera = cameraController.targetCamera;
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
      sceneRuntime.dispose();
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
