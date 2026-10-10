import type { Repo } from '../data/repo';
import type { SyncEngine, SyncStatus } from './engine';

/** Quiet period after the last local change (a grade, an edit) before pushing it. */
const DEBOUNCE_MS = 2000;
/** While the backend is unreachable, try again after 30 s, doubling up to 5 minutes. */
const RETRY_FIRST_MS = 30_000;
const RETRY_MAX_MS = 300_000;

/**
 * When to sync while signed in: shortly after local changes, when the app comes back to the
 * foreground, when the network returns, and at start. No realtime connection, no polling.
 */
export class SyncScheduler {
  private timer = 0;
  private retryTimer = 0;
  private retryDelay = RETRY_FIRST_MS;
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

  /** Called with each sync status: schedules a retry with backoff while sync is paused. */
  noteStatus(status: SyncStatus): void {
    if (status === 'synced') {
      window.clearTimeout(this.retryTimer);
      this.retryDelay = RETRY_FIRST_MS;
    } else if (status === 'paused') {
      window.clearTimeout(this.retryTimer);
      this.retryTimer = window.setTimeout(() => void this.engine.sync(), this.retryDelay);
      this.retryDelay = Math.min(this.retryDelay * 2, RETRY_MAX_MS);
    }
  }

  /** Sync now (skipping the debounce) and wait for it, e.g. before signing out. */
  async flush(): Promise<void> {
    window.clearTimeout(this.timer);
    await this.engine.sync();
  }

  stop(): void {
    window.clearTimeout(this.timer);
    window.clearTimeout(this.retryTimer);
    for (const cleanup of this.cleanups.splice(0)) cleanup();
  }
}
