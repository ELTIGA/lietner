import * as THREE from 'three';

import type { Box } from '../domain/types';
import { MASTERED } from '../domain/types';
import { canvasTexture, drawBoxLabel, woodTexture } from './textures';

export const CARD_SIZE = { width: 1.3, height: 0.8, depth: 0.012 } as const;

const BOX = { width: 1.5, depth: 1.25, height: 0.5, frontHeight: 0.32, wall: 0.05 } as const;
const SPACING = 1.7;
const MAX_VISIBLE = 40;
const CARD_TILT = -0.22;
const TRAY_CARD_STEP = 0.014;
const BOX_Z = -0.3;

export interface Slot {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

interface BoxView {
  box: Box;
  group: THREE.Group;
  stack: THREE.InstancedMesh;
  labelCanvas: HTMLCanvasElement;
  labelTexture: THREE.CanvasTexture;
  material: THREE.MeshStandardMaterial;
  count: number;
}

/** The desk, five Leitner boxes, the mastered tray, and the card stacks inside them. */
export class Desk {
  readonly root = new THREE.Group();
  private readonly views = new Map<Box, BoxView>();
  private readonly cardGeometry = new THREE.BoxGeometry(CARD_SIZE.width, CARD_SIZE.height, CARD_SIZE.depth);
  private readonly stackMaterial = new THREE.MeshStandardMaterial({ color: '#efe5cc', roughness: 0.9 });
  private highlighted: Box | null = null;

  constructor() {
    this.root.add(this.buildDesk());
    for (let box = 1; box <= MASTERED; box++) this.buildBox(box as Box);
  }

  /** Objects that respond to hover picking, tagged with `userData.box`. */
  get pickables(): THREE.Object3D[] {
    return [...this.views.values()].map((view) => view.group);
  }

  setCounts(counts: Record<Box, number>): void {
    for (const view of this.views.values()) this.setCount(view.box, counts[view.box]);
  }

  setCount(box: Box, count: number): void {
    const view = this.views.get(box)!;
    view.count = Math.max(0, count);
    view.stack.count = Math.min(view.count, MAX_VISIBLE);
    drawBoxLabel(view.labelCanvas, box === MASTERED ? '★' : String(box), view.count);
    view.labelTexture.needsUpdate = true;
  }

  count(box: Box): number {
    return this.views.get(box)!.count;
  }

  /** World transform of the card at `index` in the box's stack (clamped to the visible range). */
  slot(box: Box, index: number): Slot {
    const view = this.views.get(box)!;
    const dummy = new THREE.Object3D();
    placeInStack(dummy, box, Math.min(index, MAX_VISIBLE - 1));
    view.group.updateWorldMatrix(true, false);
    dummy.applyMatrix4(view.group.matrixWorld);
    return { position: dummy.position.clone(), quaternion: dummy.quaternion.clone() };
  }

  /** Slot for the top card, the one drawn next. */
  topSlot(box: Box): Slot {
    return this.slot(box, Math.max(this.count(box) - 1, 0));
  }

  setHighlight(box: Box | null): void {
    if (box === this.highlighted) return;
    if (this.highlighted) this.views.get(this.highlighted)!.material.emissive.setHex(0x000000);
    if (box) this.views.get(box)!.material.emissive.setHex(0x2a1a08);
    this.highlighted = box;
  }

  private buildDesk(): THREE.Object3D {
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(14, 0.3, 10),
      new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.55, metalness: 0.05 }),
    );
    top.position.set(0, -0.15, -1.2);
    top.receiveShadow = true;
    return top;
  }

  private buildBox(box: Box): void {
    const group = new THREE.Group();
    group.position.set((box - (MASTERED + 1) / 2) * SPACING, 0, BOX_Z);
    group.userData.box = box;
    const material = new THREE.MeshStandardMaterial({ color: box === MASTERED ? '#3d2b1e' : '#7a4f2e', roughness: 0.7 });
    const tray = box === MASTERED;
    const height = tray ? 0.12 : BOX.height;
    const front = tray ? 0.12 : BOX.frontHeight;
    const { width, depth, wall } = BOX;

    const parts: Array<[number, number, number, number, number, number]> = [
      [width, wall, depth, 0, wall / 2, 0],
      [width, height, wall, 0, height / 2, -depth / 2 + wall / 2],
      [width, front, wall, 0, front / 2, depth / 2 - wall / 2],
      [wall, height, depth, -width / 2 + wall / 2, height / 2, 0],
      [wall, height, depth, width / 2 - wall / 2, height / 2, 0],
    ];
    for (const [w, h, d, x, y, z] of parts) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }

    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 384;
    labelCanvas.height = 96;
    const labelTexture = canvasTexture(labelCanvas);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.28), new THREE.MeshStandardMaterial({ map: labelTexture, roughness: 0.45, metalness: 0.15 }));
    label.position.set(0, tray ? 0.06 : front / 2, depth / 2 + 0.003);
    if (tray) {
      label.position.set(0, 0.07, depth / 2 + 0.06);
      label.rotation.x = -0.6;
    }
    group.add(label);

    const stack = new THREE.InstancedMesh(this.cardGeometry, this.stackMaterial, MAX_VISIBLE);
    stack.castShadow = true;
    stack.receiveShadow = true;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    for (let i = 0; i < MAX_VISIBLE; i++) {
      placeInStack(dummy, box, i);
      // Small jitter so the stack reads as hand-filed paper, not a solid block.
      dummy.position.x += (Math.random() - 0.5) * 0.03;
      dummy.rotation.z += (Math.random() - 0.5) * 0.03;
      dummy.updateMatrix();
      stack.setMatrixAt(i, dummy.matrix);
      stack.setColorAt(i, color.setHSL(0.11, 0.45, 0.84 + Math.random() * 0.08));
    }
    stack.count = 0;
    // Bounds are computed while count is 0, so culling would hide the stack forever.
    stack.frustumCulled = false;
    group.add(stack);

    this.root.add(group);
    this.views.set(box, { box, group, stack, labelCanvas, labelTexture, material, count: 0 });
    this.setCount(box, 0);
  }
}

/** Local transform of stack card `index`: upright and filed back-to-front in boxes, flat and piled in the tray. */
function placeInStack(target: THREE.Object3D, box: Box, index: number): void {
  target.rotation.set(0, 0, 0);
  if (box === MASTERED) {
    target.position.set(0, BOX.wall + CARD_SIZE.depth / 2 + index * TRAY_CARD_STEP, 0.02);
    target.rotation.x = -Math.PI / 2;
    return;
  }
  const usable = BOX.depth - BOX.wall * 2 - 0.22;
  const z = -BOX.depth / 2 + BOX.wall + 0.16 + (index / (MAX_VISIBLE - 1)) * usable;
  target.position.set(0, BOX.wall + CARD_SIZE.height / 2 - 0.02, z);
  target.rotation.x = CARD_TILT;
}
