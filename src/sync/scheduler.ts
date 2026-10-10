import type { Repo } from '../data/repo';
import type { SyncEngine } from './engine';

/** Quiet period after the last local change (a grade, an edit) before pushing it. */
const DEBOUNCE_MS = 2000;

/**
 * When to sync while signed in: shortly after local changes, when the app comes back to the
 * foreground, when the network returns, and at start. No realtime connection, no polling.
 */
export class SyncScheduler {
  private timer = 0;
  private readonly cleanups: Array<() => void> = [];

  constructor(
    private readonly engine: SyncEngine,
    private readonly repo: Repo,
  ) {}

  start(): void {
    this.cleanups.push(this.repo.onChange(() => this.schedule()));
    const onVisible = () => {
      if (document.visibilityState === 'visible') void this.engine.sync();
    };
    // Focus covers side-by-side windows, which never change visibility; the engine coalesces repeats.
    const onFocus = () => void this.engine.sync();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onFocus);
    this.cleanups.push(() => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onFocus);
    });
    void this.engine.sync();
  }

  /** Debounced sync after a local change. */
  schedule(): void {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.engine.sync(), DEBOUNCE_MS);
  }

  /** Sync now (skipping the debounce) and wait for it, e.g. before signing out. */
  async flush(): Promise<void> {
    window.clearTimeout(this.timer);
    await this.engine.sync();
  }

  stop(): void {
    window.clearTimeout(this.timer);
    for (const cleanup of this.cleanups.splice(0)) cleanup();
  }
}
