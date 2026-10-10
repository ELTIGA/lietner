import gsap from 'gsap';
import * as THREE from 'three';

import type { Box, Card } from '../domain/types';
import { MASTERED } from '../domain/types';
import { t } from '../strings';
import type { Desk, Slot } from './desk';
import { CARD_SIZE } from './desk';
import { drawCardFace } from './textures';
import type { AnimationSpeed, CardView } from './views';

const LANDSCAPE_FOCUS_DISTANCE = 3.4;
const LANDSCAPE_FOCUS_LIFT = 0.3;
/** Portrait: the card fills about 85% of the width, but never more than 45% of the height. */
const PORTRAIT_CARD_WIDTH = 0.85;
const PORTRAIT_CARD_HEIGHT = 0.45;
/** Portrait: card center, as a fraction of the half-height above the screen center (negative is below). */
const PORTRAIT_FOCUS_LIFT = -0.1;
/**
 * Portrait reads the card close to a high camera, outside the desk lamp's cone; a little
 * self-illumination keeps the paper from turning gray there.
 */
const PORTRAIT_FACE_GLOW = 0.45;
const DURATION = { draw: 0.5, flip: 0.34, fly: 0.5, shake: 0.22, settle: 0.25, follow: 0.1 } as const;
const ARC_HEIGHT = 1.4;
/** Radians of tilt per world unit of horizontal drag. */
const DRAG_TILT = 0.18;
const Z_AXIS = new THREE.Vector3(0, 0, 1);
/** The live card casts a shadow only below this height (world units above the desk). */
const SHADOW_MAX_HEIGHT = 1.6;

/**
 * The single live card being reviewed. A holder group carries position and orientation
 * (box ↔ focus); the card mesh inside it only rotates for the flip.
 */
export class CardActor implements CardView {
  readonly holder = new THREE.Group();
  private readonly mesh: THREE.Mesh;
  private readonly materials: THREE.MeshStandardMaterial[];
  private readonly raycaster = new THREE.Raycaster();
  private timeline: gsap.core.Timeline | null = null;
  private speed: AnimationSpeed = 1;
  private flipped = false;
  /** Where the card rests while being read; drags offset from here. */
  private rest: Slot | null = null;
  private readonly drag = { x: 0 };
  private dragFollow: gsap.QuickToFunc | null = null;
  private dragSettle: gsap.core.Tween | null = null;
  shouldSkip: () => boolean = () => false;

  constructor(
    private readonly desk: Desk,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly requestRender: () => void = () => {},
  ) {
    const edge = new THREE.MeshStandardMaterial({ color: '#e8dcbf', roughness: 0.9 });
    this.materials = [edge, edge, edge, edge, new THREE.MeshStandardMaterial({ roughness: 0.85 }), new THREE.MeshStandardMaterial({ roughness: 0.85 })];
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(CARD_SIZE.width, CARD_SIZE.height, CARD_SIZE.depth), this.materials);
    this.mesh.castShadow = true;
    this.holder.add(this.mesh);
    this.holder.visible = false;
  }

  get isFlipped(): boolean {
    return this.flipped;
  }

  get busy(): boolean {
    return this.timeline?.isActive() ?? false;
  }

  /** Anything moving that needs frames: a timeline, the finger-follow or the snap-back. */
  get animating(): boolean {
    return this.busy || !!this.dragSettle?.isActive() || !!this.dragFollow?.tween.isActive();
  }

  setSpeed(speed: AnimationSpeed): void {
    this.speed = speed;
  }

  finish(): void {
    this.timeline?.progress(1);
    this.requestRender();
  }

  draw(card: Card, from: Box = card.box): Promise<void> {
    this.setFaces(card);
    this.resetDrag();
    this.flipped = false;
    this.mesh.rotation.set(0, 0, 0);
    const start = this.desk.topSlot(from);
    this.desk.setCount(from, this.desk.count(from) - 1);
    this.holder.position.copy(start.position);
    this.holder.quaternion.copy(start.quaternion);
    this.holder.visible = true;

    const focus = this.focusSlot();
    this.rest = focus;
    const timeline = gsap.timeline();
    this.addFlight(timeline, start, focus, DURATION.draw, 0.6, 'power3.out');
    return this.run(timeline);
  }

  flip(): Promise<void> {
    if (this.flipped) return Promise.resolve();
    this.flipped = true;
    const timeline = gsap.timeline();
    timeline
      .to(this.mesh.rotation, { y: Math.PI, duration: DURATION.flip, ease: 'power2.inOut' }, 0)
      .to(this.mesh.position, { z: 0.25, duration: DURATION.flip / 2, ease: 'power1.out', yoyo: true, repeat: 1 }, 0);
    return this.run(timeline);
  }

  file(to: Box, knew: boolean): Promise<void> {
    // A swipe leaves the card offset and tilted; the flight starts from wherever it is.
    this.resetDrag();
    const timeline = gsap.timeline();
    const start = { position: this.holder.position.clone(), quaternion: this.holder.quaternion.clone() };
    if (!knew) {
      timeline.to(this.holder.position, { x: '+=0.08', duration: DURATION.shake / 6, ease: 'sine.inOut', yoyo: true, repeat: 5 });
    }
    // Restore the face-forward orientation so the card files in front-first.
    timeline.to(this.mesh.rotation, { y: this.flipped ? Math.PI * 2 : 0, duration: DURATION.fly * 0.7, ease: 'power2.inOut' }, '>');
    this.addFlight(timeline, start, this.desk.slot(to, this.desk.count(to)), DURATION.fly, to === MASTERED ? 0.9 : ARC_HEIGHT, 'power2.inOut', '<');
    timeline.call(() => {
      this.holder.visible = false;
      this.rest = null;
      this.desk.setCount(to, this.desk.count(to) + 1);
    });
    return this.run(timeline);
  }

  hide(): void {
    this.timeline?.kill();
    this.resetDrag();
    this.holder.visible = false;
    this.rest = null;
    this.requestRender();
  }

  /** After a resize or rotation: move a resting card to the new reading position. */
  relayout(): void {
    if (!this.holder.visible || !this.rest || this.busy) return;
    this.resetDrag();
    this.applyGlow();
    this.rest = this.focusSlot();
    this.holder.position.copy(this.rest.position);
    this.holder.quaternion.copy(this.rest.quaternion);
    this.requestRender();
  }

  hitTest(clientX: number, clientY: number): boolean {
    if (!this.holder.visible) return false;
    const ndc = new THREE.Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.intersectObject(this.mesh, false).length > 0;
  }

  dragTo(dx: number): void {
    if (!this.rest || this.busy) return;
    this.dragSettle?.kill();
    this.dragFollow ??= gsap.quickTo(this.drag, 'x', { duration: DURATION.follow, ease: 'power3.out', onUpdate: () => this.applyDrag() });
    this.dragFollow(dx * this.worldPerPixel());
    this.requestRender();
  }

  dragCancel(): void {
    this.dragFollow?.tween.kill();
    this.dragFollow = null;
    this.dragSettle = gsap.to(this.drag, { x: 0, duration: DURATION.settle, ease: 'power3.out', onUpdate: () => this.applyDrag() });
    this.requestRender();
  }

  private resetDrag(): void {
    this.dragFollow?.tween.kill();
    this.dragFollow = null;
    this.dragSettle?.kill();
    this.dragSettle = null;
    this.drag.x = 0;
  }

  /** Slides the card sideways in screen space and tilts it like a card pushed by a finger. */
  private applyDrag(): void {
    if (!this.rest) return;
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    this.holder.position.copy(this.rest.position).addScaledVector(right, this.drag.x);
    this.holder.quaternion.copy(this.rest.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(Z_AXIS, -this.drag.x * DRAG_TILT));
    this.requestRender();
  }

  /** World units per screen pixel at the reading distance. */
  private worldPerPixel(): number {
    const visibleHeight = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.focusDistance();
    return visibleHeight / window.innerHeight;
  }

  private focusDistance(): number {
    const { aspect, fov } = this.camera;
    if (aspect >= 1) return LANDSCAPE_FOCUS_DISTANCE;
    const tanHalfVertical = Math.tan(THREE.MathUtils.degToRad(fov / 2));
    const byWidth = CARD_SIZE.width / (2 * tanHalfVertical * aspect * PORTRAIT_CARD_WIDTH);
    const byHeight = CARD_SIZE.height / (2 * tanHalfVertical * PORTRAIT_CARD_HEIGHT);
    return Math.max(byWidth, byHeight);
  }

  /** Point in front of the camera where the card is read; the card faces the camera. */
  private focusSlot(): Slot {
    const distance = this.focusDistance();
    const lift =
      this.camera.aspect >= 1 ? LANDSCAPE_FOCUS_LIFT : PORTRAIT_FOCUS_LIFT * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * distance;
    const position = new THREE.Vector3(0, lift, -distance).applyMatrix4(this.camera.matrixWorld);
    const holder = new THREE.Object3D();
    holder.position.copy(position);
    holder.lookAt(this.camera.position);
    return { position, quaternion: holder.quaternion.clone() };
  }

  /** Bezier arc between two slots with an orientation slerp, driven by one proxy tween. */
  private addFlight(timeline: gsap.core.Timeline, from: Slot, to: Slot, duration: number, lift: number, ease: string, position?: gsap.Position): void {
    const control = from.position.clone().lerp(to.position, 0.5);
    control.y = Math.max(from.position.y, to.position.y) + lift;
    const curve = new THREE.QuadraticBezierCurve3(from.position.clone(), control, to.position.clone());
    const proxy = { t: 0 };
    timeline.to(
      proxy,
      {
        t: 1,
        duration,
        ease,
        onUpdate: () => {
          curve.getPoint(proxy.t, this.holder.position);
          this.holder.quaternion.slerpQuaternions(from.quaternion, to.quaternion, proxy.t);
          // Near the desk the shadow grounds the card; up at the reading position the lamp
          // would throw it as a large dark shape across the desk.
          this.mesh.castShadow = this.holder.position.y < SHADOW_MAX_HEIGHT;
        },
      },
      position,
    );
  }

  private run(timeline: gsap.core.Timeline): Promise<void> {
    this.timeline?.progress(1);
    this.timeline = timeline;
    const done = new Promise<void>((resolve) => timeline.eventCallback('onComplete', () => resolve()));
    if (this.speed === 0 || this.shouldSkip()) timeline.progress(1);
    else timeline.timeScale(this.speed);
    this.requestRender();
    return done;
  }

  private applyGlow(): void {
    const glow = this.camera.aspect < 1 ? PORTRAIT_FACE_GLOW : 0;
    for (const [index, material] of this.materials.entries()) {
      material.emissive.set(glow ? '#fff4dd' : '#000000');
      material.emissiveIntensity = glow;
      if (index >= 4) material.emissiveMap = glow ? material.map : null;
      material.needsUpdate = true;
    }
  }

  private setFaces(card: Card): void {
    const label = t.card.box(card.box);
    for (const [index, side] of [
      [4, 'front'],
      [5, 'back'],
    ] as const) {
      const material = this.materials[index]!;
      material.map?.dispose();
      material.map = drawCardFace(side === 'front' ? card.front : card.back, side, label);
    }
    this.applyGlow();
  }
}
