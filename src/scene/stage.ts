import * as THREE from 'three';

import { setMaxAnisotropy } from './textures';
import type { LayoutMode } from './views';

interface Rig {
  lookAt: THREE.Vector3;
  /** Unit vector from the look-at point toward the camera. */
  direction: THREE.Vector3;
}

const LANDSCAPE_HOME = new THREE.Vector3(0, 6.6, 5.6);
const LANDSCAPE: Rig = {
  lookAt: new THREE.Vector3(0, 0.1, -0.9),
  direction: LANDSCAPE_HOME.clone().sub(new THREE.Vector3(0, 0.1, -0.9)).normalize(),
};
const LANDSCAPE_DISTANCE = LANDSCAPE_HOME.distanceTo(LANDSCAPE.lookAt);
/** Half-width of desk content (the box row) that must stay in frame in landscape. */
const LANDSCAPE_HALF_WIDTH = 5.9;
const MIN_FOV = 34;

// Portrait: boxes in two rows, seen from higher up; the look-at sits in front of them
// so the boxes land in the upper half and the card and buttons get the lower half.
const PORTRAIT: Rig = {
  lookAt: new THREE.Vector3(0, 0, 1.1),
  direction: new THREE.Vector3(0, 1, 0.55).normalize(),
};
const PORTRAIT_FOV = 50;
const PORTRAIT_HALF_WIDTH = 2.85;

const PARALLAX = 0.35;
/** Keep rendering until the parallax lerp is this close (squared world units). */
const SETTLE_EPSILON = 1e-8;
/** Frames rendered after everything goes quiet, so the final animation state is drawn. */
const TRAILING_FRAMES = 2;

/** Automatic quality drop: average frame time (ms) above this over a window of animated frames. */
const SLOW_FRAME_MS = 24;
const SAMPLE_WINDOW = 30;

function isPhone(): boolean {
  return window.matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 768;
}

/**
 * Renderer, camera rig, lights, and an on-demand render loop: frames are drawn only
 * while something changes (an animation, the parallax settling, a requested redraw).
 */
export class Stage {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  readonly renderer: THREE.WebGLRenderer;
  private readonly pointer = new THREE.Vector2();
  private readonly raycaster = new THREE.Raycaster();
  private readonly frameCallbacks: Array<(delta: number) => void> = [];
  private readonly layoutCallbacks: Array<(mode: LayoutMode) => void> = [];
  private readonly animationSources: Array<() => boolean> = [];
  private readonly timer = new THREE.Timer();
  private readonly home = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private readonly lamp: THREE.SpotLight;
  private mode: LayoutMode = 'landscape';
  private pixelRatio: number;
  private looping = false;
  private dirty = true;
  private idleFrames = 0;
  private lastFrameTime = 0;
  private frameSamples: number[] = [];

  constructor(private readonly host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    const phone = isPhone();
    this.pixelRatio = Math.min(window.devicePixelRatio, phone ? 1.5 : 2);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    setMaxAnisotropy(this.renderer.capabilities.getMaxAnisotropy());
    host.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color('#15110e');
    this.scene.fog = new THREE.Fog('#15110e', 12, 22);
    this.lamp = this.addLights(phone ? 1024 : 2048);

    window.addEventListener('resize', this.resize);
    window.addEventListener('pointermove', this.trackPointer);
    this.resize();
  }

  get layout(): LayoutMode {
    return this.mode;
  }

  /** Normalized device coordinates of the last mouse position. */
  get pointerNdc(): THREE.Vector2 {
    return this.pointer;
  }

  onFrame(callback: (delta: number) => void): void {
    this.frameCallbacks.push(callback);
  }

  /** Called after every resize, with the rig already updated (rotation, window changes). */
  onLayout(callback: (mode: LayoutMode) => void): void {
    this.layoutCallbacks.push(callback);
  }

  /** The loop keeps running while any source reports an animation in progress. */
  addAnimationSource(isAnimating: () => boolean): void {
    this.animationSources.push(isAnimating);
  }

  requestRender = (): void => {
    this.dirty = true;
    if (this.looping) return;
    this.looping = true;
    this.idleFrames = 0;
    this.renderer.setAnimationLoop(this.tick);
  };

  pick(objects: THREE.Object3D[]): THREE.Intersection | undefined {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.intersectObjects(objects, true)[0];
  }

  private addLights(shadowSize: number): THREE.SpotLight {
    this.scene.add(new THREE.HemisphereLight('#ffe9c7', '#1a120c', 0.55));

    // Warm desk-lamp key light from the upper left.
    const lamp = new THREE.SpotLight('#ffd49a', 260, 30, Math.PI / 5, 0.55, 1.6);
    lamp.position.set(-4.5, 8.5, 4);
    lamp.target.position.set(0.4, 0, 0.3);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(shadowSize, shadowSize);
    lamp.shadow.bias = -0.0004;
    lamp.shadow.radius = 4;
    this.scene.add(lamp, lamp.target);

    const fill = new THREE.DirectionalLight('#9fb4d6', 0.35);
    fill.position.set(6, 4, 6);
    this.scene.add(fill);
    return lamp;
  }

  private rig(): Rig {
    return this.mode === 'portrait' ? PORTRAIT : LANDSCAPE;
  }

  private readonly resize = (): void => {
    const { clientWidth: width, clientHeight: height } = this.host;
    if (!width || !height) return;
    const aspect = width / height;
    this.mode = aspect < 1 ? 'portrait' : 'landscape';
    this.camera.aspect = aspect;

    let distance: number;
    if (this.mode === 'landscape') {
      distance = LANDSCAPE_DISTANCE;
      // The vertical FOV that keeps the whole box row in frame at any aspect ratio.
      const fitFov = THREE.MathUtils.radToDeg(2 * Math.atan(LANDSCAPE_HALF_WIDTH / (distance * aspect)));
      this.camera.fov = Math.max(MIN_FOV, fitFov);
    } else {
      this.camera.fov = PORTRAIT_FOV;
      // Back the camera off until both box rows fit the narrow width.
      const halfHorizontal = Math.atan(Math.tan(THREE.MathUtils.degToRad(PORTRAIT_FOV / 2)) * aspect);
      distance = PORTRAIT_HALF_WIDTH / Math.tan(halfHorizontal);
    }
    const { lookAt, direction } = this.rig();
    this.home.copy(lookAt).addScaledVector(direction, distance);
    const fog = this.scene.fog as THREE.Fog;
    fog.near = distance + 2.8;
    fog.far = distance + 12.8;

    // Snap rather than lerp so layout-dependent positions (the reading slot) are right immediately.
    this.camera.position.copy(this.home);
    this.camera.lookAt(lookAt);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.renderer.setSize(width, height);
    for (const callback of this.layoutCallbacks) callback(this.mode);
    this.requestRender();
  };

  private readonly trackPointer = (event: PointerEvent): void => {
    // Parallax and hover are mouse-only: a finger shouldn't swing the camera.
    if (event.pointerType !== 'mouse') return;
    this.pointer.set((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
    this.requestRender();
  };

  private readonly tick = (time: number): void => {
    this.timer.update(time);
    const delta = Math.min(this.timer.getDelta(), 0.1);
    this.target.copy(this.home);
    if (this.mode === 'landscape') this.target.add(new THREE.Vector3(this.pointer.x * PARALLAX, this.pointer.y * PARALLAX * 0.5, 0));
    this.camera.position.lerp(this.target, 1 - Math.exp(-delta * 3));
    const settling = this.camera.position.distanceToSquared(this.target) > SETTLE_EPSILON;
    this.camera.lookAt(this.rig().lookAt);
    for (const callback of this.frameCallbacks) callback(delta);
    this.renderer.render(this.scene, this.camera);

    const animating = this.animationSources.some((isAnimating) => isAnimating());
    this.sampleFrame(time, animating);
    if (this.dirty || animating || settling) {
      this.idleFrames = 0;
    } else if (++this.idleFrames >= TRAILING_FRAMES) {
      this.looping = false;
      this.lastFrameTime = 0;
      this.renderer.setAnimationLoop(null);
    }
    this.dirty = false;
  };

  /** Measures frame times during animations and lowers quality one step when they run slow. */
  private sampleFrame(time: number, animating: boolean): void {
    const elapsed = time - this.lastFrameTime;
    // Skip the first frame after idling and long gaps (background tabs).
    if (animating && this.lastFrameTime && elapsed < 250) this.frameSamples.push(elapsed);
    this.lastFrameTime = time;
    if (this.frameSamples.length < SAMPLE_WINDOW) return;
    const average = this.frameSamples.reduce((sum, value) => sum + value, 0) / this.frameSamples.length;
    this.frameSamples = [];
    if (average > SLOW_FRAME_MS && this.lowerQuality()) console.info(`Frames averaged ${average.toFixed(1)} ms; lowered render quality.`);
  }

  private lowerQuality(): boolean {
    if (this.pixelRatio > 1) {
      this.pixelRatio = Math.max(1, this.pixelRatio - 0.25);
      this.renderer.setPixelRatio(this.pixelRatio);
      this.renderer.setSize(this.host.clientWidth, this.host.clientHeight);
      return true;
    }
    const shadowMap = this.renderer.shadowMap;
    if (shadowMap.enabled && shadowMap.type !== THREE.BasicShadowMap) {
      shadowMap.type = THREE.BasicShadowMap;
      this.lamp.shadow.mapSize.set(512, 512);
      this.lamp.shadow.map?.dispose();
      this.lamp.shadow.map = null;
      this.refreshMaterials();
      return true;
    }
    if (shadowMap.enabled) {
      shadowMap.enabled = false;
      this.refreshMaterials();
      return true;
    }
    return false;
  }

  /** Shader programs depend on the shadow settings, so materials must recompile after a change. */
  private refreshMaterials(): void {
    this.scene.traverse((object) => {
      const material = (object as THREE.Mesh).material;
      for (const item of Array.isArray(material) ? material : material ? [material] : []) item.needsUpdate = true;
    });
  }
}
