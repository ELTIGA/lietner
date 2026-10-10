import { today } from '../domain/day';
import { sessionQueue } from '../domain/leitner';
import type { Card } from '../domain/types';
import { MASTERED } from '../domain/types';
import type { App } from './app';
import { relativeDay } from './app';
import { t } from '../strings';
import { h, kbd } from './dom';

interface Stats {
  knew: number;
  missed: number;
  mastered: number;
}

/** One review pass over every due card in the current deck. */
export class ReviewSession {
  private queue: Card[] = [];
  private index = 0;
  private current: Card | null = null;
  private revealed = false;
  private ended = false;
  private chain: Promise<void> = Promise.resolve();
  /** Actions queued but not yet started. */
  private pending = 0;
  private readonly stats: Stats = { knew: 0, missed: 0, mastered: 0 };
  private readonly hud = h('section', { class: 'review-hud', 'aria-live': 'polite' });

  constructor(
    private readonly app: App,
    private readonly stage: HTMLElement,
    private readonly onExit: () => void,
  ) {}

  async start(): Promise<void> {
    this.app.deps.actor.shouldSkip = () => this.pending > 0;
    this.queue = sessionQueue(this.app.cards, today());
    this.stage.replaceChildren(this.hud);
    await this.enqueue(() => this.next());
  }

  handleKey(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();
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

  /**
   * Serializes actions. Any new input fast-forwards the running animation,
   * so keyboard users are never blocked waiting for a tween.
   */
  private enqueue(action: () => Promise<void>): Promise<void> {
    this.app.deps.actor.finish();
    this.pending++;
    this.chain = this.chain
      .then(() => {
        this.pending--;
        return this.ended ? undefined : action();
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
    const updated = await this.app.deps.repo.gradeCard(card, knew, today());
    this.app.replaceCard(updated);
    if (knew) this.stats.knew++;
    else this.stats.missed++;
    if (updated.box === MASTERED) this.stats.mastered++;
    this.index++;
    await this.app.deps.actor.file(updated.box, knew);
    await this.next();
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
      h('div', { class: 'review-controls' }, ...controls),
      h('p', { class: 'review-hint' }, t.review.hint, kbd('S'), t.review.hintSkip),
    );
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
    this.current = null;
    this.ended = true;
    this.handleKey = (event) => {
      if (event.key === 'Enter' || event.key === 'Escape') {
        event.preventDefault();
        this.exit();
      }
    };
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
    this.app.deps.actor.shouldSkip = () => false;
    this.app.deps.actor.hide();
    this.onExit();
  }
}

function stat(label: string, value: number, tone: string): HTMLElement {
  return h('div', { class: `stat ${tone}` }, h('dt', {}, label), h('dd', {}, String(value)));
}
