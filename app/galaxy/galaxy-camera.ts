// Galaxy 相机聚焦控制器(Q8b 从 galaxy-experience.tsx 逐字拆出):setFocusVisibility/
// applyTarget/CameraFlight/锚点取景/残差收敛。可见性语义保持不变:总览=atlas(黑洞可见、
// 行星隐藏),行星聚焦=solitude;改道飞行从当前相机位置继续;飞行结束(settled)后残差收敛。
import * as THREE from "three";
import {
  PLANET_BY_ID,
  PLANETS,
  SINGULARITY,
  type TargetId,
} from "./cosmic-atlas";
import { cubicBezier } from "./galaxy-scene-assets";
import type { BodyRuntime, GalaxySceneRuntime } from "./galaxy-scene";

export type CameraFlight = {
  fromId: TargetId;
  toId: TargetId;
  startedAt: number;
  duration: number;
  startCamera: THREE.Vector3;
  startLook: THREE.Vector3;
  controlA: THREE.Vector3;
  controlB: THREE.Vector3;
};

export function createCameraController({
  runtime,
  mobile,
  prefersReducedMotion,
}: {
  runtime: GalaxySceneRuntime;
  mobile: boolean;
  prefersReducedMotion: boolean;
}) {
  const {
    universe,
    galaxy,
    camera,
    currentLook,
    blackHoleRoot,
    eventHorizon,
    accretionDisk,
    lensedArcPlane,
    eventMaskPlane,
    horizonCrown,
    galaxySpaces,
    foregroundDust,
    planetaryOrbitLines,
    bodies,
    targetAccent,
    targetFog,
  } = runtime;

  let appliedTarget: TargetId = "singularity";
  let activeBody: BodyRuntime = bodies.get("singularity")!;
  let cameraFlight: CameraFlight | null = null;
  let zoom = 1;
  const targetCamera = new THREE.Vector3();
  const targetLook = new THREE.Vector3();
  const flightCamera = new THREE.Vector3();
  const flightDirection = new THREE.Vector3();
  const flightSide = new THREE.Vector3();
  const flightUp = new THREE.Vector3(0, 1, 0);

  function setFocusVisibility(id: TargetId, previousId: TargetId | null = null, flying = false) {
    const expandedUniverseVisible = id !== "singularity" || flying;
    const atlasVisible = id === "singularity" || (flying && previousId === "singularity");
    const activeGalaxyId = id === "singularity" ? null : PLANET_BY_ID[id].galaxyId;

    galaxySpaces.forEach((spaceRuntime, galaxyId) => {
      spaceRuntime.planets.visible = expandedUniverseVisible;
      spaceRuntime.visual.visible = atlasVisible;
      spaceRuntime.visual.scale.setScalar(atlasVisible ? 1.65 : activeGalaxyId === galaxyId ? 0.72 : 0.9);
    });
    PLANETS.forEach((definition) => {
      const bodyRuntime = bodies.get(definition.id);
      if (bodyRuntime) bodyRuntime.group.visible = expandedUniverseVisible;
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

  // frame:调用方的动画帧计数,首帧(0)不触发飞行动画。
  function applyTarget(id: TargetId, startedAt?: number, frame = 0) {
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

  // 每帧相机推进:锚点取景 → 巡航摆动 → 缩放/视差 → 飞行插值或缓动收敛 →
  // lookAt → 引力透镜平面对齐 → FOV。返回 transitionProgress 供遥测使用。
  function updateCameraFrame({
    timestamp,
    elapsed,
    quiet,
    quietMotion,
    cruising,
    pointer,
    warp,
    passage,
    compactScene,
  }: {
    timestamp: number;
    elapsed: number;
    quiet: boolean;
    quietMotion: number;
    cruising: boolean;
    pointer: THREE.Vector2;
    warp: number;
    passage: number;
    compactScene: boolean;
  }) {
    universe.updateMatrixWorld(true);
    activeBody.cameraAnchor.getWorldPosition(targetCamera);
    activeBody.focusAnchor.getWorldPosition(targetLook);
    if (!cameraFlight && cruising && !prefersReducedMotion) {
      const radius = quiet ? 0.05 : 0.12;
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
    return { transitionProgress };
  }

  return {
    get appliedTarget() { return appliedTarget; },
    get activeBody() { return activeBody; },
    get cameraFlight() { return cameraFlight; },
    get targetCamera() { return targetCamera; },
    get zoom() { return zoom; },
    set zoom(value: number) { zoom = value; },
    applyTarget,
    updateCameraFrame,
  };
}

export type CameraController = ReturnType<typeof createCameraController>;
