import * as THREE from 'three';

import { setMaxAnisotropy } from './textures';

const CAMERA_HOME = new THREE.Vector3(0, 6.6, 5.6);
const LOOK_AT = new THREE.Vector3(0, 0.1, -0.9);
/** Half-width of desk content (box row) that must always stay in frame. */
const FRAME_HALF_WIDTH = 5.9;
const MIN_FOV = 34;
const PARALLAX = 0.35;
const MAX_DPR = 2;

/** Renderer, camera, lights, resize handling and the render loop. */
export class Stage {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  readonly renderer: THREE.WebGLRenderer;
  private readonly pointer = new THREE.Vector2();
  private readonly raycaster = new THREE.Raycaster();
  private readonly frameCallbacks: Array<(delta: number) => void> = [];
  private readonly timer = new THREE.Timer();

  constructor(private readonly host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_DPR));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    setMaxAnisotropy(this.renderer.capabilities.getMaxAnisotropy());
    host.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color('#15110e');
    this.scene.fog = new THREE.Fog('#15110e', 12, 22);
    this.camera.position.copy(CAMERA_HOME);
    this.camera.lookAt(LOOK_AT);
    this.addLights();

    window.addEventListener('resize', this.resize);
    window.addEventListener('pointermove', this.trackPointer);
    this.resize();
    this.renderer.setAnimationLoop(this.tick);
  }

  /** Normalized device coordinates of the last pointer position. */
  get pointerNdc(): THREE.Vector2 {
    return this.pointer;
  }

  onFrame(callback: (delta: number) => void): void {
    this.frameCallbacks.push(callback);
  }

  pick(objects: THREE.Object3D[]): THREE.Intersection | undefined {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.intersectObjects(objects, true)[0];
  }

  private addLights(): void {
    this.scene.add(new THREE.HemisphereLight('#ffe9c7', '#1a120c', 0.55));

    // Warm desk-lamp key light from the upper left.
    const lamp = new THREE.SpotLight('#ffd49a', 260, 30, Math.PI / 5, 0.55, 1.6);
    lamp.position.set(-4.5, 8.5, 4);
    lamp.target.position.set(0.4, 0, 0.3);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(2048, 2048);
    lamp.shadow.bias = -0.0004;
    lamp.shadow.radius = 4;
    this.scene.add(lamp, lamp.target);

    const fill = new THREE.DirectionalLight('#9fb4d6', 0.35);
    fill.position.set(6, 4, 6);
    this.scene.add(fill);
  }

  private readonly resize = (): void => {
    const { clientWidth: width, clientHeight: height } = this.host;
    const aspect = width / height;
    this.camera.aspect = aspect;
    // Pick the vertical FOV that keeps the whole box row in frame at any aspect ratio.
    const distance = CAMERA_HOME.distanceTo(LOOK_AT);
    const fitFov = THREE.MathUtils.radToDeg(2 * Math.atan(FRAME_HALF_WIDTH / (distance * aspect)));
    this.camera.fov = Math.max(MIN_FOV, fitFov);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  private readonly trackPointer = (event: PointerEvent): void => {
    this.pointer.set((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
  };

  private readonly tick = (): void => {
    this.timer.update();
    const delta = Math.min(this.timer.getDelta(), 0.1);
    const target = CAMERA_HOME.clone().add(new THREE.Vector3(this.pointer.x * PARALLAX, this.pointer.y * PARALLAX * 0.5, 0));
    this.camera.position.lerp(target, 1 - Math.exp(-delta * 3));
    this.camera.lookAt(LOOK_AT);
    for (const callback of this.frameCallbacks) callback(delta);
    this.renderer.render(this.scene, this.camera);
  };
}
