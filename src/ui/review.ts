import { today } from '../domain/day';
import { sessionQueue } from '../domain/leitner';
import type { Card } from '../domain/types';
import { MASTERED } from '../domain/types';
import { t } from '../strings';
import type { App } from './app';
import { relativeDay } from './app';
import { h, kbd } from './dom';
import type { SwipeTarget } from './gestures';
import type { ToastHandle } from './toast';
import { showToast } from './toast';

interface Stats {
  knew: number;
  missed: number;
  mastered: number;
}

interface LastGrade {
  previous: Card;
  graded: Card;
  knew: boolean;
}

/** Fraction of the screen width a swipe must travel to grade. */
const SWIPE_THRESHOLD = 0.25;
/** A quick flick grades even when short. */
const FLING_VELOCITY = 0.6;
const FLING_MIN_DISTANCE = 40;
const UNDO_WINDOW_MS = 5000;
const HAPTIC_MS = 10;

/** One review pass over every due card in the current deck. */
export class ReviewSession implements SwipeTarget {
  private queue: Card[] = [];
  private index = 0;
  private current: Card | null = null;
  private revealed = false;
  /** No more review actions (finished or ended); only undo can resume. */
  private ended = false;
  private summaryShown = false;
  private chain: Promise<void> = Promise.resolve();
  /** Actions queued but not yet started. */
  private pending = 0;
  private readonly stats: Stats = { knew: 0, missed: 0, mastered: 0 };
  private last: LastGrade | null = null;
  private undoToast: ToastHandle | null = null;
  private readonly hud = h('section', { class: 'review-hud' });
  /** Card text for screen readers and browser translation; the 3D card is only pixels. */
  private readonly mirror = h('p', { class: 'sr-only', 'aria-live': 'polite', dir: 'auto' });

  constructor(
    private readonly app: App,
    private readonly stage: HTMLElement,
    private readonly onExit: () => void,
  ) {}

  get active(): boolean {
    return !this.summaryShown;
  }

  async start(): Promise<void> {
    this.app.deps.actor.shouldSkip = () => this.pending > 0;
    this.queue = sessionQueue(this.app.cards, today());
    this.stage.replaceChildren(this.hud, this.mirror);
    await this.enqueue(() => this.next());
  }

  handleKey(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();
    if (key === 'z') {
      event.preventDefault();
      if (!event.repeat) this.undo();
      return;
    }
    if (this.summaryShown) {
      if (key === 'enter' || key === 'escape') {
        event.preventDefault();
        this.exit();
      }
      return;
    }
    const actions: Record<string, () => void> = {
      ' ': () => void this.enqueue(() => this.reveal()),
      enter: () => void this.enqueue(() => (this.revealed ? Promise.resolve() : this.reveal())),
      j: () => void this.enqueue(() => this.grade(true)),
      arrowright: () => void this.enqueue(() => this.grade(true)),
      f: () => void this.enqueue(() => this.grade(false)),
      arrowleft: () => void this.enqueue(() => this.grade(false)),
      s: () => this.app.deps.actor.finish(),
      escape: () => this.end(),
    };
    const action = actions[key];
    if (!action) return;
    event.preventDefault();
    if (event.repeat && key !== 's') return;
    action();
  }

  // ---- Touch: tap to flip or fast-forward, swipe right for Knew it, left for Missed ----

  tap(clientX: number, clientY: number): void {
    if (this.summaryShown) return;
    const { actor } = this.app.deps;
    if (actor.busy || this.pending > 0) actor.finish();
    else if (this.current && !this.revealed && actor.hitTest(clientX, clientY)) void this.enqueue(() => this.reveal());
  }

  swipeStart(): boolean {
    return !this.ended && !!this.current && this.pending === 0 && !this.app.deps.actor.busy;
  }

  swipeMove(dx: number): void {
    this.app.deps.actor.dragTo(dx);
    const progress = Math.max(-1, Math.min(1, dx / (window.innerWidth * SWIPE_THRESHOLD)));
    this.hud.style.setProperty('--swipe', progress.toFixed(3));
  }

  swipeEnd(dx: number, velocity: number): void {
    this.hud.style.setProperty('--swipe', '0');
    const far = Math.abs(dx) >= window.innerWidth * SWIPE_THRESHOLD;
    const fling = Math.abs(velocity) >= FLING_VELOCITY && Math.abs(dx) >= FLING_MIN_DISTANCE && Math.sign(velocity) === Math.sign(dx);
    if (dx !== 0 && (far || fling)) void this.enqueue(() => this.grade(dx > 0));
    else this.app.deps.actor.dragCancel();
  }

  /**
   * Serializes actions. Any new input fast-forwards the running animation,
   * so keyboard users are never blocked waiting for a tween.
   */
  private enqueue(action: () => Promise<void>, evenIfEnded = false): Promise<void> {
    this.app.deps.actor.finish();
    this.pending++;
    this.chain = this.chain
      .then(() => {
        this.pending--;
        return this.ended && !evenIfEnded ? undefined : action();
      })
      .catch((error: unknown) => console.error('Review action failed', error));
    return this.chain;
  }

  private async next(): Promise<void> {
    if (this.ended) {
      this.current = null;
      return;
    }
    this.current = this.queue[this.index] ?? null;
    this.revealed = false;
    if (!this.current) {
      this.showSummary();
      return;
    }
    this.renderHud();
    await this.app.deps.actor.draw(this.current);
  }

  private async reveal(): Promise<void> {
    if (!this.current || this.revealed) return;
    this.revealed = true;
    this.renderHud();
    await this.app.deps.actor.flip();
  }

  /** Grading straight from the front is allowed: it skips the reveal for cards you clearly know. */
  private async grade(knew: boolean): Promise<void> {
    const card = this.current;
    if (!card) return;
    this.current = null;
    navigator.vibrate?.(HAPTIC_MS);
    const { repo, actor } = this.app.deps;
    const previous = await repo.getCard(card.id);
    const updated = previous && (await repo.gradeCard(card.id, knew, today()));
    if (!previous || !updated) {
      // Deleted on another device mid-session: put it away without counting it.
      this.index++;
      actor.hide();
      await this.next();
      return;
    }
    this.app.replaceCard(updated);
    if (knew) this.stats.knew++;
    else this.stats.missed++;
    if (updated.box === MASTERED) this.stats.mastered++;
    this.index++;
    this.offerUndo({ previous, graded: updated, knew });
    await actor.file(updated.box, knew);
    await this.next();
  }

  private offerUndo(last: LastGrade): void {
    this.last = last;
    this.undoToast?.dismiss();
    this.undoToast = showToast(t.review.graded(last.graded.box), {
      duration: UNDO_WINDOW_MS,
      action: { label: t.review.undo, onClick: () => this.undo() },
    });
    window.setTimeout(() => {
      if (this.last === last) this.last = null;
    }, UNDO_WINDOW_MS);
  }

  /** One-step undo: restores the last graded card and brings it back to the reading position. */
  private undo(): void {
    const last = this.last;
    if (!last) return;
    this.last = null;
    this.undoToast?.dismiss();
    this.undoToast = null;
    void this.enqueue(async () => {
      const { repo, actor, desk } = this.app.deps;
      const restored = await repo.restoreGrade(last.previous);
      if (!restored) return;
      this.app.replaceCard(restored);
      if (last.knew) this.stats.knew--;
      else this.stats.missed--;
      if (last.graded.box === MASTERED) this.stats.mastered--;
      // The next card may already be out: put it back in its box first.
      if (this.current) {
        actor.hide();
        desk.setCount(this.current.box, desk.count(this.current.box) + 1);
      }
      if (this.ended) {
        this.ended = false;
        this.summaryShown = false;
        actor.shouldSkip = () => this.pending > 0;
      }
      this.index = Math.max(0, this.index - 1);
      this.queue[this.index] = restored;
      this.current = restored;
      this.revealed = false;
      this.renderHud();
      await actor.draw(restored, last.graded.box);
    }, true);
  }

  private renderHud(): void {
    const total = this.queue.length;
    const progress = h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': total, 'aria-valuenow': this.index });
    progress.style.setProperty('--progress', `${(this.index / Math.max(total, 1)) * 100}%`);

    const controls = this.revealed
      ? [
          h('button', { class: 'btn miss large', onclick: () => void this.enqueue(() => this.grade(false)) }, t.review.missed, kbd('F', '←')),
          h('button', { class: 'btn know large', onclick: () => void this.enqueue(() => this.grade(true)) }, t.review.knew, kbd('J', '→')),
        ]
      : [h('button', { class: 'btn primary large', onclick: () => void this.enqueue(() => this.reveal()) }, t.review.showAnswer, kbd('Space'))];

    this.hud.replaceChildren(
      h(
        'div',
        { class: 'review-top' },
        h('span', { class: 'review-count' }, t.review.progress(Math.min(this.index + 1, total), total)),
        progress,
        h('button', { class: 'btn ghost small', onclick: () => this.end() }, t.review.end, kbd('Esc')),
      ),
      h('span', { class: 'swipe-edge missed', 'aria-hidden': 'true' }, t.review.missed),
      h('span', { class: 'swipe-edge knew', 'aria-hidden': 'true' }, t.review.knew),
      h('div', { class: 'review-controls' }, ...controls),
      h('p', { class: 'review-hint' }, t.review.hint, kbd('S'), t.review.hintSkip),
    );
    if (this.current) this.mirror.textContent = this.revealed ? t.review.answerText(this.current.back) : t.review.questionText(this.current.front);
  }

  private showSummary(): void {
    this.app.deps.actor.hide();
    const reviewed = this.stats.knew + this.stats.missed;
    const day = today();
    const upcoming = this.app.cards.filter((card) => card.box !== MASTERED && card.dueDay > day);
    const nextDay = upcoming.reduce((min, card) => Math.min(min, card.dueDay), Infinity);
    const nextCount = upcoming.filter((card) => card.dueDay === nextDay).length;

    const done = h('button', { class: 'btn primary large', onclick: () => this.exit() }, t.review.backToDesk, kbd('↵'));
    this.hud.replaceChildren(
      h(
        'div',
        { class: 'summary' },
        h('p', { class: 'eyebrow' }, t.review.complete),
        h('h2', {}, t.review.reviewed(reviewed)),
        h(
          'dl',
          { class: 'summary-stats' },
          stat(t.review.statKnew, this.stats.knew, 'know'),
          stat(t.review.statMissed, this.stats.missed, 'miss'),
          stat(t.review.statMastered, this.stats.mastered, 'star'),
        ),
        Number.isFinite(nextDay) && h('p', { class: 'home-meta' }, t.review.next(nextCount, relativeDay(nextDay))),
        done,
      ),
    );
    this.mirror.textContent = '';
    this.current = null;
    this.ended = true;
    this.summaryShown = true;
    done.focus();
  }

  private end(): void {
    if (this.ended) return;
    this.ended = true;
    this.app.deps.actor.shouldSkip = () => true;
    this.app.deps.actor.finish();
    // Let an in-flight grade finish saving so the summary counts it.
    void this.chain.then(() => {
      // Return the unreviewed card to its stack before summarizing.
      if (this.current) this.app.deps.desk.setCount(this.current.box, this.app.deps.desk.count(this.current.box) + 1);
      this.showSummary();
    });
  }

  private exit(): void {
    this.last = null;
    this.undoToast?.dismiss();
    this.app.deps.actor.shouldSkip = () => false;
    this.app.deps.actor.hide();
    this.onExit();
  }
}

function stat(label: string, value: number, tone: string): HTMLElement {
  return h('div', { class: `stat ${tone}` }, h('dt', {}, label), h('dd', {}, String(value)));
}
