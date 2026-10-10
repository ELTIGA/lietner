import type { Box, Card } from '../domain/types';

/** 0 is instant. */
export type AnimationSpeed = 1 | 2 | 0;

export type LayoutMode = 'landscape' | 'portrait';

/** The boxes and their card stacks: the 3D desk, or the DOM text mode without WebGL. */
export interface DeskView {
  setCounts(counts: Record<Box, number>): void;
  setCount(box: Box, count: number): void;
  count(box: Box): number;
}

/** The single card under review. Every animation can be fast-forwarded with finish(). */
export interface CardView {
  /** When this returns true, new animations jump straight to their end (input is queued). */
  shouldSkip: () => boolean;
  readonly busy: boolean;
  setSpeed(speed: AnimationSpeed): void;
  /** Jump any running animation to its end state (its completion callbacks still fire). */
  finish(): void;
  /** Lift the top card of `from` (default: the card's box) to the reading position, front up. */
  draw(card: Card, from?: Box): Promise<void>;
  flip(): Promise<void>;
  /** Fly the card into `to` (a box or the mastered tray). */
  file(to: Box, knew: boolean): Promise<void>;
  hide(): void;
  /** True when a screen point (client px) is on the visible card. */
  hitTest(clientX: number, clientY: number): boolean;
  /** Swipe: follow the finger by `dx` client pixels. */
  dragTo(dx: number): void;
  /** Swipe released below the threshold: settle back to the reading position. */
  dragCancel(): void;
}
