import type { Backup } from '../data/backup';
import { exportBackup, importBackup, parseBackup } from '../data/backup';
import type { Database } from '../data/db';
import type { AnimationSpeed } from '../scene/views';
import { t } from '../strings';
import type { App } from './app';
import { confirmDialog } from './dialog';
import { downloadText, h, kbd } from './dom';

const SPEEDS: Array<[AnimationSpeed, string]> = [
  [1, t.settings.speedNormal],
  [2, t.settings.speedFast],
  [0, t.settings.speedInstant],
];

/** Downloads every live deck and card as a JSON backup file. */
export async function downloadBackup(db: Database): Promise<Backup> {
  const backup = await exportBackup(db);
  downloadText(t.settings.backupFilename(new Date().toISOString().slice(0, 10)), JSON.stringify(backup, null, 2));
  return backup;
}

export class SettingsDialog {
  readonly element = h('dialog', { class: 'dialog', 'aria-label': t.settings.title });
  private opener: HTMLElement | null = null;
  private readonly accountBox = h('div', { class: 'account-section' });

  constructor(private readonly app: App) {
    this.element.addEventListener('click', (event) => {
      if (event.target === this.element) this.element.close();
    });
    this.element.addEventListener('close', () => {
      if (this.opener?.isConnected) this.opener.focus();
      this.opener = null;
    });
  }

  get isOpen(): boolean {
    return this.element.open;
  }

  open(): void {
    this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.render();
    this.element.showModal();
  }

  /** Updates the account section in place while open (sign-in state or sync status changed). */
  refresh(): void {
    if (this.isOpen) this.accountBox.replaceChildren(...this.accountSection());
  }

  private accountSection(): HTMLElement[] {
    const { account } = this.app;
    if (!account.available) return [];
    if (!account.user) {
      return [
        h('h3', {}, t.account.section),
        h('p', { class: 'hint' }, t.account.guestHint),
        h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'button', onclick: () => void account.signIn() }, t.account.signIn)),
      ];
    }
    const status = account.refusedCount ? t.sync.refused(account.refusedCount) : t.sync[account.status ?? 'syncing'];
    return [
      h('h3', {}, t.account.section),
      h('p', { class: 'account-line' }, t.account.signedIn(account.user.email)),
      h('p', { class: 'hint', 'aria-live': 'polite' }, status),
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn', type: 'button', onclick: () => void account.signOut() }, t.account.signOut),
        h('button', { class: 'btn danger-btn', type: 'button', onclick: () => void account.deleteAccount() }, t.account.deleteAccount),
      ),
    ];
  }

  private render(): void {
    this.accountBox.replaceChildren(...this.accountSection());
    const status = h('p', { class: 'hint', 'aria-live': 'polite' });
    const speedGroup = h(
      'div',
      { class: 'segmented', role: 'radiogroup', 'aria-label': t.settings.speed },
      ...SPEEDS.map(([speed, label]) =>
        h(
          'label',
          {},
          h('input', {
            type: 'radio',
            name: 'speed',
            checked: this.app.speed === speed,
            onchange: () => void this.app.setSpeed(speed),
          }),
          h('span', {}, label),
        ),
      ),
    );

    const exportJson = async () => {
      const backup = await downloadBackup(this.app.deps.db);
      status.textContent = t.settings.exported(backup.decks.length, backup.cards.length);
    };
    const file = h('input', { type: 'file', accept: 'application/json,.json', class: 'file-input', 'aria-label': t.settings.backupFile });
    file.addEventListener('change', async () => {
      const chosen = file.files?.[0];
      file.value = '';
      if (!chosen) return;
      try {
        const backup = parseBackup(await chosen.text());
        const ok = await confirmDialog(t.settings.importConfirm(backup.decks.length, backup.cards.length), {
          title: t.settings.importTitle,
          confirmLabel: t.settings.importAction,
          danger: true,
        });
        if (!ok) return;
        await importBackup(this.app.deps.db, backup);
        this.app.deps.repo.notifyChanged();
        await this.app.reload();
        status.textContent = t.settings.restored;
      } catch (error) {
        console.error('Backup import failed', error);
        status.textContent = error instanceof Error ? error.message : t.settings.importFailed;
      }
    });

    this.element.replaceChildren(
      h(
        'form',
        { method: 'dialog', class: 'dialog-body' },
        h(
          'div',
          { class: 'drawer-head' },
          h('h2', {}, t.settings.title),
          h('button', { class: 'btn icon', 'aria-label': t.settings.close, value: 'close' }, '✕'),
        ),
        h('h3', {}, t.settings.speed),
        speedGroup,
        this.accountBox,
        h('h3', {}, t.settings.backup),
        h('p', { class: 'hint' }, this.app.account.user ? t.settings.backupHintSignedIn : t.settings.backupHint),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn', type: 'button', onclick: exportJson }, t.settings.exportJson),
          h('button', { class: 'btn', type: 'button', onclick: () => file.click() }, t.settings.importJson),
          file,
        ),
        status,
        h('h3', {}, t.settings.keyboard),
        h(
          'dl',
          { class: 'shortcuts' },
          ...(
            [
              [['↵'], t.settings.shortcuts.start],
              [['Space'], t.settings.shortcuts.reveal],
              [['J', '→'], t.settings.shortcuts.knew],
              [['F', '←'], t.settings.shortcuts.missed],
              [['S'], t.settings.shortcuts.skip],
              [['E'], t.settings.shortcuts.edit],
              [['Z'], t.settings.shortcuts.undo],
              [['Esc'], t.settings.shortcuts.escape],
            ] as const
          ).flatMap(([keys, label]) => [h('dt', {}, kbd(...keys)), h('dd', {}, label)]),
        ),
      ),
    );
  }
}
