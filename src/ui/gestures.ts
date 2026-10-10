/** Pixels a pointer may wander before a press stops counting as a tap. */
const TAP_SLOP = 10;
/** A drag only becomes a swipe once it is clearly horizontal. */
const SWIPE_START = 12;

export interface SwipeTarget {
  /** Press and release without moving. */
  tap(clientX: number, clientY: number): void;
  /** Return false to refuse the swipe (nothing to grade, or an animation is running). */
  swipeStart(): boolean;
  swipeMove(dx: number): void;
  /** `velocity` in px/ms, signed like dx. */
  swipeEnd(dx: number, velocity: number): void;
}

/**
 * Tap and horizontal-swipe recognition with pointer events (touch, pen and mouse alike).
 * `target()` is asked on every press so the active review session can change.
 */
export function attachSwipe(element: HTMLElement, target: () => SwipeTarget | null): () => void {
  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastTime = 0;
  let velocity = 0;
  let swiping = false;
  let moved = false;
  let active: SwipeTarget | null = null;

  const down = (event: PointerEvent) => {
    if (pointerId !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
    active = target();
    if (!active) return;
    pointerId = event.pointerId;
    startX = lastX = event.clientX;
    startY = event.clientY;
    lastTime = event.timeStamp;
    velocity = 0;
    swiping = false;
    moved = false;
    element.setPointerCapture?.(event.pointerId);
  };

  const move = (event: PointerEvent) => {
    if (event.pointerId !== pointerId || !active) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (Math.hypot(dx, dy) > TAP_SLOP) moved = true;
    if (!swiping && Math.abs(dx) > SWIPE_START && Math.abs(dx) > Math.abs(dy) * 1.2) swiping = active.swipeStart();
    if (swiping) {
      const elapsed = event.timeStamp - lastTime;
      if (elapsed > 0) velocity = 0.7 * ((event.clientX - lastX) / elapsed) + 0.3 * velocity;
      lastX = event.clientX;
      lastTime = event.timeStamp;
      active.swipeMove(dx);
    }
  };

  const up = (event: PointerEvent) => {
    if (event.pointerId !== pointerId || !active) return;
    const dx = event.clientX - startX;
    if (swiping) active.swipeEnd(dx, velocity);
    else if (!moved && event.type === 'pointerup') active.tap(event.clientX, event.clientY);
    pointerId = null;
    active = null;
  };

  const cancel = (event: PointerEvent) => {
    if (event.pointerId !== pointerId || !active) return;
    if (swiping) active.swipeEnd(0, 0);
    pointerId = null;
    active = null;
  };

  element.addEventListener('pointerdown', down);
  element.addEventListener('pointermove', move);
  element.addEventListener('pointerup', up);
  element.addEventListener('pointercancel', cancel);
  return () => {
    element.removeEventListener('pointerdown', down);
    element.removeEventListener('pointermove', move);
    element.removeEventListener('pointerup', up);
    element.removeEventListener('pointercancel', cancel);
  };
}
