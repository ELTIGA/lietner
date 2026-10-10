import type { SessionUser } from '../auth/session';
import { hasStoredSession, storedSessionUser, syncAvailable } from '../auth/config';
import { wipeAccountData } from '../data/wipe';
import type { SyncStatus } from '../sync/engine';
import { SyncEngine } from '../sync/engine';
import type { AccountState } from '../sync/remote';
import { SyncScheduler } from '../sync/scheduler';
import { t } from '../strings';
import type { App } from './app';
import { confirmDialog, openDialog } from './dialog';
import { downloadBackup } from './settings';
import { openSignIn } from './signIn';
import { showToast } from './toast';

type SessionModule = typeof import('../auth/session');

/** Tells other open tabs to reload after this one wiped the account's data. */
const CHANNEL = 'lietner';
const WIPED = 'wiped';

/**
 * Optional account and sync. Guests never load the SDK; signing in turns sync on, and signing
 * out (or the account disappearing) removes the account's data from this device.
 */
export class Account {
  user: SessionUser | null = null;
  status: SyncStatus | null = null;
  private session: SessionModule | null = null;
  private engine: SyncEngine | null = null;
  private scheduler: SyncScheduler | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL) : null;

  constructor(private readonly app: App) {
    this.channel?.addEventListener('message', (event) => {
      if (event.data === WIPED) location.reload();
    });
  }

  /** False in guest-only builds (no Supabase configured), which hide every account control. */
  get available(): boolean {
    return syncAvailable;
  }

  get refusedCount(): number {
    return this.engine?.refusedCount ?? 0;
  }

  onChange(listener: () => void): void {
    this.listeners.add(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  /** Loads the SDK-backed session module on first use. */
  load(): Promise<SessionModule> {
    return this.session ? Promise.resolve(this.session) : import('../auth/session').then((module) => (this.session = module));
  }

  /** At start, after the first render: resume a stored session and start syncing. */
  async restore(): Promise<void> {
    if (!syncAvailable || !hasStoredSession()) return;
    // Show the signed-in state straight away from storage: offline, the SDK can spend
    // half a minute retrying a token refresh before it answers.
    const stored = storedSessionUser();
    if (stored) {
      this.user = { id: stored.id, email: stored.email ?? '' };
      this.status = 'syncing';
      this.emit();
    }
    try {
      const session = await this.load();
      const user = stored ? this.user! : await session.currentUser();
      if (user) this.startSync(user, session);
    } catch (error) {
      console.error('Could not restore the session', error);
    }
  }

  async signIn(): Promise<void> {
    if (!syncAvailable || this.user) return;
    const user = await openSignIn(this);
    if (user) await this.afterSignIn(user);
  }

  /**
   * First sign-in on this device. Guest rows are all unsynced, so starting sync merges them into
   * the account by id. If both sides already hold decks, ask first, before anything is pushed.
   */
  private async afterSignIn(user: SessionUser): Promise<void> {
    const session = await this.load();
    const localDecks = (await this.app.deps.repo.listDecks()).filter((deck) => !deck.sample);
    if (localDecks.length) {
      const accountHasData = await session.accountHasData().catch((error: unknown) => {
        console.warn('Could not check the account for existing decks', error);
        return true;
      });
      if (accountHasData) {
        const merge = await confirmDialog(t.account.mergeBody(localDecks.length), {
          title: t.account.mergeTitle,
          confirmLabel: t.account.mergeConfirm,
          cancelLabel: t.account.mergeCancel,
        });
        if (!merge) {
          // Still guest data: sign out without touching it.
          await session.signOutHere();
          return;
        }
      }
    }
    // A never-studied sample deck must not overwrite the account's progress on the same deck.
    await this.app.deps.repo.yieldPristineSample();
    this.startSync(user, session);
    showToast(t.account.welcome(user.email));
  }

  private startSync(user: SessionUser, session: SessionModule): void {
    this.user = user;
    this.engine = new SyncEngine(this.app.deps.db, session.createRemote(user.id), {
      onStatus: (status) => {
        this.status = status;
        this.scheduler?.noteStatus(status);
        this.emit();
      },
      onChanged: () => this.app.onRemoteChanges(),
      onAccountGone: (state) => void this.signedOutElsewhere(state),
    });
    this.scheduler = new SyncScheduler(this.engine, this.app.deps.repo);
    this.scheduler.start();
    this.emit();
  }

  async signOut(): Promise<void> {
    if (!this.user) return;
    await this.scheduler?.flush();
    const unsynced = (await this.engine?.unsyncedCount()) ?? 0;
    if (unsynced > 0) {
      const choice = await openDialog<'export' | 'signOut' | null>({
        title: t.account.signOutTitle,
        cancelValue: null,
        body: () => [t.account.signOutUnsynced(unsynced)].map((text) => paragraph(text)),
        actions: [
          { label: t.dialog.cancel, value: null, autofocus: true },
          { label: t.account.exportFirst, value: 'export' },
          { label: t.account.signOutAnyway, value: 'signOut', tone: 'danger' },
        ],
      });
      if (!choice) return;
      if (choice === 'export') await downloadBackup(this.app.deps.db);
    } else if (!(await confirmDialog(t.account.signOutBody, { title: t.account.signOutTitle, confirmLabel: t.account.signOut }))) {
      return;
    }
    await this.endSession();
    showToast(t.account.signedOutToast);
  }

  async deleteAccount(): Promise<void> {
    if (!this.user) return;
    for (;;) {
      const choice = await openDialog<'export' | 'delete' | null>({
        title: t.account.deleteTitle,
        cancelValue: null,
        body: () => [paragraph(t.account.deleteBody)],
        actions: [
          { label: t.dialog.cancel, value: null, autofocus: true },
          { label: t.account.exportFirst, value: 'export' },
          { label: t.account.deleteConfirm, value: 'delete', tone: 'danger' },
        ],
      });
      if (!choice) return;
      if (choice === 'delete') break;
      await downloadBackup(this.app.deps.db);
    }
    this.scheduler?.stop();
    try {
      await (await this.load()).deleteAccount();
    } catch (error) {
      console.error('Account deletion failed', error);
      showToast(t.account.deleteFailed, { tone: 'error' });
      this.scheduler?.start();
      return;
    }
    await this.endSession();
    showToast(t.account.deleted);
  }

  /** The account was deleted on another device, or this session ended: sign out here too. */
  private async signedOutElsewhere(state: Exclude<AccountState, 'ok'>): Promise<void> {
    if (!this.user || !this.engine) return;
    this.scheduler?.stop();
    const unsynced = await this.engine.unsyncedCount();
    if (unsynced > 0) {
      const actions: Array<{ label: string; value: 'export' | 'remove' | 'signIn'; tone?: 'danger' | 'primary' }> = [
        { label: t.account.exportFirst, value: 'export', tone: 'primary' },
        { label: t.account.removeNow, value: 'remove', tone: 'danger' },
      ];
      // A session that merely ended can be resumed: signing in again pushes the changes.
      if (state === 'signedOut') actions.unshift({ label: t.account.signInAgain, value: 'signIn' });
      const choice = await openDialog<'export' | 'remove' | 'signIn'>({
        title: t.account.goneUnsyncedTitle,
        cancelValue: 'export',
        body: () => [paragraph(t.account.goneUnsynced(unsynced))],
        actions,
      });
      if (choice === 'signIn') {
        await (await this.load()).signOutHere();
        this.reset();
        await this.signIn();
        return;
      }
      if (choice === 'export') await downloadBackup(this.app.deps.db);
    }
    await this.endSession();
    showToast(state === 'deleted' ? t.account.goneDeleted : t.account.goneSignedOut);
  }

  /** Signs this device out and removes the account's decks, cards and sync state from it. */
  private async endSession(): Promise<void> {
    this.scheduler?.stop();
    await wipeAccountData(this.app.deps.db);
    await (await this.load()).signOutHere();
    this.reset();
    this.channel?.postMessage(WIPED);
    await this.app.reload();
  }

  private reset(): void {
    this.scheduler?.stop();
    this.scheduler = null;
    this.engine = null;
    this.user = null;
    this.status = null;
    this.emit();
  }
}

function paragraph(text: string): HTMLElement {
  const element = document.createElement('p');
  element.className = 'dialog-message';
  element.textContent = text;
  return element;
}
