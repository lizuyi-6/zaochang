import * as THREE from "three";
import {
  GALAXIES,
  PLANETS,
  PLANETS_BY_GALAXY,
  PLANET_BY_ID,
  type TargetId,
} from "./cosmic-atlas";
import type { CameraController } from "./galaxy-camera";
import type { GalaxySceneRuntime } from "./galaxy-scene";

export type GalaxyInteractionOptions = {
  mount: HTMLDivElement;
  runtime: GalaxySceneRuntime;
  cameraController: CameraController;
  mobile: boolean;
  targetRef: { current: TargetId };
  onSelectTarget: (id: TargetId) => void;
  onResetView: () => void;
  onToggleQuiet: () => void;
  onToggleCruise: () => void;
  onContextLost: () => void;
};

export type GalaxyInteraction = {
  readonly pointer: THREE.Vector2;
  readonly dragRotation: THREE.Vector2;
  hidden: boolean;
  readonly renderedWidth: number;
  readonly renderedHeight: number;
  readonly compactScene: boolean;
  dispose(): void;
};

export function createGalaxyInteraction({
  mount,
  runtime,
  cameraController,
  mobile,
  targetRef,
  onSelectTarget,
  onResetView,
  onToggleQuiet,
  onToggleCruise,
  onContextLost,
}: GalaxyInteractionOptions): GalaxyInteraction {
  const {
    renderer, camera, composer, bloom, animatedMaterials,
    overviewCameraAnchor, overviewFocusAnchor, bodies, pickables,
  } = runtime;
  const pointer = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const dragRotation = new THREE.Vector2();
  let dragging = false;
  let dragX = 0;
  let dragY = 0;
  let dragDistance = 0;
  let hidden = false;

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
      if (picked) onSelectTarget(picked.id);
    }
  }

  function handleWheel(event: WheelEvent) {
    event.preventDefault();
    cameraController.zoom = THREE.MathUtils.clamp(cameraController.zoom + event.deltaY * 0.00045, 0.76, 1.28);
  }

  function handleKeyDown(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    if (target?.matches("button, a, input, textarea, select, [contenteditable='true']")) return;
    if (event.key === "0") onSelectTarget("singularity");
    if (/^[1-4]$/.test(event.key)) {
      if (targetRef.current === "singularity") {
        const galaxy = GALAXIES[Number(event.key) - 1];
        const firstPlanet = galaxy ? PLANETS_BY_GALAXY[galaxy.id][0] : undefined;
        if (firstPlanet) onSelectTarget(firstPlanet.id);
      } else {
        const activePlanet = PLANET_BY_ID[targetRef.current];
        const sibling = PLANETS_BY_GALAXY[activePlanet.galaxyId][Number(event.key) - 1];
        if (sibling) onSelectTarget(sibling.id);
      }
    }
    if (event.key === "Escape") onSelectTarget("singularity");
    if (event.key.toLowerCase() === "r") onResetView();
    if (event.key.toLowerCase() === "q") onToggleQuiet();
    if (event.code === "Space") {
      event.preventDefault();
      onToggleCruise();
    }
  }

  function handleVisibility() {
    hidden = document.hidden;
  }

  function handleContextLost(event: Event) {
    event.preventDefault();
    onContextLost();
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

  return {
    pointer,
    dragRotation,
    get hidden() { return hidden; },
    set hidden(value: boolean) { hidden = value; },
    get renderedWidth() { return renderedWidth; },
    get renderedHeight() { return renderedHeight; },
    get compactScene() { return compactScene; },
    dispose() {
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
    },
  };
}
