import gsap from 'gsap';
import * as THREE from 'three';

import type { Box, Card } from '../domain/types';
import { MASTERED } from '../domain/types';
import type { Desk, Slot } from './desk';
import { CARD_SIZE } from './desk';
import { drawCardFace } from './textures';

export type AnimationSpeed = 1 | 2 | 0;

const FOCUS_DISTANCE = 3.4;
const DURATION = { draw: 0.5, flip: 0.34, fly: 0.5, shake: 0.22 } as const;
const ARC_HEIGHT = 1.4;

/**
 * The single live card being reviewed. A holder group carries position and orientation
 * (box ↔ focus); the card mesh inside it only rotates for the flip.
 */
export class CardActor {
  readonly holder = new THREE.Group();
  private readonly mesh: THREE.Mesh;
  private readonly materials: THREE.MeshStandardMaterial[];
  private timeline: gsap.core.Timeline | null = null;
  private speed: AnimationSpeed = 1;
  private flipped = false;
  /** When this returns true, new animations jump straight to their end (e.g. input is queued). */
  shouldSkip: () => boolean = () => false;

  constructor(
    private readonly desk: Desk,
    private readonly camera: THREE.Camera,
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

  setSpeed(speed: AnimationSpeed): void {
    this.speed = speed;
  }

  /** Jump any running animation to its end state (its completion callbacks still fire). */
  finish(): void {
    this.timeline?.progress(1);
  }

  /** Lift the top card of `card.box` toward the camera, front side up. */
  draw(card: Card): Promise<void> {
    this.setFaces(card);
    this.flipped = false;
    this.mesh.rotation.set(0, 0, 0);
    const from = this.desk.topSlot(card.box);
    this.desk.setCount(card.box, this.desk.count(card.box) - 1);
    this.holder.position.copy(from.position);
    this.holder.quaternion.copy(from.quaternion);
    this.holder.visible = true;

    const timeline = gsap.timeline();
    this.addFlight(timeline, from, this.focusSlot(), DURATION.draw, 0.6, 'power3.out');
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

  /** Fly the card from focus into `to` (a box or the mastered tray). */
  file(to: Box, knew: boolean): Promise<void> {
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
      this.desk.setCount(to, this.desk.count(to) + 1);
    });
    return this.run(timeline);
  }

  hide(): void {
    this.timeline?.kill();
    this.holder.visible = false;
  }

  /** Point in front of the camera where the card is read; the card faces the camera. */
  private focusSlot(): Slot {
    const position = new THREE.Vector3(0, 0.3, -FOCUS_DISTANCE).applyMatrix4(this.camera.matrixWorld);
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
    return done;
  }

  private setFaces(card: Card): void {
    const label = `BOX ${card.box}`;
    for (const [index, side] of [
      [4, 'front'],
      [5, 'back'],
    ] as const) {
      const material = this.materials[index]!;
      material.map?.dispose();
      material.map = drawCardFace(side === 'front' ? card.front : card.back, side, label);
      material.needsUpdate = true;
    }
  }
}
