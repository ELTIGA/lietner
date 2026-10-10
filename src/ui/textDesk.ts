import gsap from 'gsap';

import type { Box, Card } from '../domain/types';
import { MASTERED } from '../domain/types';
import type { AnimationSpeed, CardView, DeskView } from '../scene/views';
import { t } from '../strings';
import { h } from './dom';

const BOXES: Box[] = [1, 2, 3, 4, 5, MASTERED];
const DURATION = { draw: 0.3, flip: 0.3, file: 0.35, settle: 0.25, follow: 0.1 } as const;

/** Text mode without WebGL: the five boxes and the tray as a row of labeled counters. */
export class TextDesk implements DeskView {
  readonly element = h('div', { class: 'text-desk', 'aria-hidden': 'true' });
  private readonly counts = new Map<Box, number>();
  private readonly cells = new Map<Box, HTMLElement>();

  constructor() {
    for (const box of BOXES) {
      const cell = h(
        'div',
        { class: `text-box b${box}` },
        h('span', { class: 'text-box-label' }, box === MASTERED ? '★' : String(box)),
        h('span', { class: 'text-box-count' }, '0'),
      );
      this.cells.set(box, cell);
      this.element.append(cell);
    }
  }

  setCounts(counts: Record<Box, number>): void {
    for (const box of BOXES) this.setCount(box, counts[box]);
  }

  setCount(box: Box, count: number): void {
    const value = Math.max(0, count);
    this.counts.set(box, value);
    const label = this.cells.get(box)?.querySelector('.text-box-count');
    if (label) label.textContent = String(value);
  }

  count(box: Box): number {
    return this.counts.get(box) ?? 0;
  }

  cell(box: Box): HTMLElement {
    return this.cells.get(box)!;
  }
}

/** Text mode card: a DOM index card that flips with a quick turn and slides into its box. */
export class TextCard implements CardView {
  readonly element = h('div', { class: 'text-card', 'aria-hidden': 'true', hidden: true });
  private readonly label = h('span', { class: 'text-card-label' });
  private readonly text = h('p', { class: 'text-card-text', dir: 'auto' });
  private card: Card | null = null;
  private flipped = false;
  private speed: AnimationSpeed = 1;
  private timeline: gsap.core.Timeline | null = null;
  private dragFollow: gsap.QuickToFunc | null = null;
  shouldSkip: () => boolean = () => false;

  constructor(private readonly desk: TextDesk) {
    this.element.append(this.label, this.text);
  }

  get busy(): boolean {
    return this.timeline?.isActive() ?? false;
  }

  setSpeed(speed: AnimationSpeed): void {
    this.speed = speed;
  }

  finish(): void {
    this.timeline?.progress(1);
  }

  draw(card: Card, from: Box = card.box): Promise<void> {
    this.card = card;
    this.flipped = false;
    this.showSide();
    this.desk.setCount(from, this.desk.count(from) - 1);
    this.element.hidden = false;
    const timeline = gsap.timeline();
    timeline.fromTo(
      this.element,
      { autoAlpha: 0, y: -60, scale: 0.85, x: 0, rotation: 0 },
      { autoAlpha: 1, y: 0, scale: 1, duration: DURATION.draw, ease: 'power3.out' },
    );
    return this.run(timeline);
  }

  flip(): Promise<void> {
    if (this.flipped) return Promise.resolve();
    this.flipped = true;
    const timeline = gsap.timeline();
    timeline
      .to(this.element, { rotationY: 90, duration: DURATION.flip / 2, ease: 'power2.in' })
      .call(() => this.showSide())
      .fromTo(this.element, { rotationY: -90 }, { rotationY: 0, duration: DURATION.flip / 2, ease: 'power2.out' });
    return this.run(timeline);
  }

  file(to: Box, _knew: boolean): Promise<void> {
    this.dragFollow?.tween.kill();
    this.dragFollow = null;
    const card = this.element.getBoundingClientRect();
    const box = this.desk.cell(to).getBoundingClientRect();
    const timeline = gsap.timeline();
    timeline
      .to(this.element, {
        x: box.left + box.width / 2 - (card.left + card.width / 2),
        y: box.top + box.height / 2 - (card.top + card.height / 2),
        scale: 0.2,
        rotation: 0,
        autoAlpha: 0,
        duration: DURATION.file,
        ease: 'power2.in',
      })
      .call(() => {
        this.element.hidden = true;
        this.desk.setCount(to, this.desk.count(to) + 1);
      });
    return this.run(timeline);
  }

  hide(): void {
    this.timeline?.kill();
    this.element.hidden = true;
    this.card = null;
  }

  hitTest(clientX: number, clientY: number): boolean {
    if (this.element.hidden) return false;
    const rect = this.element.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  }

  dragTo(dx: number): void {
    if (this.busy || this.element.hidden) return;
    this.dragFollow ??= gsap.quickTo(this.element, 'x', { duration: DURATION.follow, ease: 'power3.out' });
    this.dragFollow(dx);
    gsap.set(this.element, { rotation: dx * 0.03 });
  }

  dragCancel(): void {
    this.dragFollow?.tween.kill();
    this.dragFollow = null;
    gsap.to(this.element, { x: 0, rotation: 0, duration: DURATION.settle, ease: 'power3.out' });
  }

  private showSide(): void {
    if (!this.card) return;
    this.element.classList.toggle('back', this.flipped);
    this.label.textContent = `${this.flipped ? t.card.answer : t.card.question} ${t.card.box(this.card.box)}`;
    this.text.textContent = this.flipped ? this.card.back : this.card.front;
  }

  private run(timeline: gsap.core.Timeline): Promise<void> {
    this.timeline?.progress(1);
    this.timeline = timeline;
    const done = new Promise<void>((resolve) => timeline.eventCallback('onComplete', () => resolve()));
    if (this.speed === 0 || this.shouldSkip()) timeline.progress(1);
    else timeline.timeScale(this.speed);
    return done;
  }
}
