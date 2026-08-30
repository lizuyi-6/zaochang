"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { createGalaxyInteraction } from "./galaxy-interaction";
import { createGalaxyAnimation } from "./galaxy-animation";
import styles from "./galaxy.module.css";

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
    const cameraController = createCameraController({ runtime: sceneRuntime, mobile, prefersReducedMotion });

    cameraController.applyTarget(targetRef.current);

    const interaction = createGalaxyInteraction({
      mount,
      runtime: sceneRuntime,
      cameraController,
      mobile,
      targetRef,
      onSelectTarget: selectTarget,
      onResetView: resetView,
      onToggleQuiet: toggleQuiet,
      onToggleCruise: toggleCruise,
      onContextLost: () => setWebglError(true),
    });

    const animation = createGalaxyAnimation({
      runtime: sceneRuntime,
      cameraController,
      interaction,
      prefersReducedMotion,
      targetRef,
      resetRef,
      warpRef,
      pausedRef,
      quietRef,
      cruiseRef,
      passageRef,
      onReady: () => setReady(true),
    });
    animation.start();

    return () => {
      animation.dispose();
      interaction.dispose();
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
