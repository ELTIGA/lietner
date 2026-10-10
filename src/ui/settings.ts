import { exportBackup, importBackup, parseBackup } from '../data/backup';
import type { AnimationSpeed } from '../scene/cardActor';
import type { App } from './app';
import { downloadText, h, kbd } from './dom';

const SPEEDS: Array<[AnimationSpeed, string]> = [
  [1, 'Normal'],
  [2, 'Fast'],
  [0, 'Instant'],
];

export class SettingsDialog {
  readonly element = h('dialog', { class: 'dialog', 'aria-label': 'Settings' });

  constructor(private readonly app: App) {
    this.element.addEventListener('click', (event) => {
      if (event.target === this.element) this.element.close();
    });
  }

  get isOpen(): boolean {
    return this.element.open;
  }

  open(): void {
    this.render();
    this.element.showModal();
  }

  private render(): void {
    const status = h('p', { class: 'hint', 'aria-live': 'polite' });
    const speedGroup = h(
      'div',
      { class: 'segmented', role: 'radiogroup', 'aria-label': 'Animation speed' },
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
      const backup = await exportBackup(this.app.deps.db);
      downloadText(`leitner-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(backup, null, 2));
      status.textContent = `Exported ${backup.decks.length} decks, ${backup.cards.length} cards.`;
    };
    const file = h('input', { type: 'file', accept: 'application/json,.json', class: 'file-input', 'aria-label': 'Backup file' });
    file.addEventListener('change', async () => {
      const chosen = file.files?.[0];
      file.value = '';
      if (!chosen) return;
      try {
        const backup = parseBackup(await chosen.text());
        const ok = window.confirm(`Replace ALL current decks and progress with this backup (${backup.decks.length} decks, ${backup.cards.length} cards)?`);
        if (!ok) return;
        await importBackup(this.app.deps.db, backup);
        await this.app.reload();
        status.textContent = 'Backup restored.';
      } catch (error) {
        console.error('Backup import failed', error);
        status.textContent = error instanceof Error ? error.message : 'Import failed.';
      }
    });

    this.element.replaceChildren(
      h(
        'form',
        { method: 'dialog', class: 'dialog-body' },
        h('div', { class: 'drawer-head' }, h('h2', {}, 'Settings'), h('button', { class: 'btn icon', 'aria-label': 'Close settings', value: 'close' }, '✕')),
        h('h3', {}, 'Animation speed'),
        speedGroup,
        h('h3', {}, 'Backup'),
        h('p', { class: 'hint' }, 'Progress lives only in this browser. Export regularly.'),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn', type: 'button', onclick: exportJson }, 'Export JSON'),
          h('button', { class: 'btn', type: 'button', onclick: () => file.click() }, 'Import JSON…'),
          file,
        ),
        status,
        h('h3', {}, 'Keyboard'),
        h(
          'dl',
          { class: 'shortcuts' },
          ...(
            [
              [['↵'], 'Start review'],
              [['Space'], 'Show answer'],
              [['J', '→'], 'Knew it'],
              [['F', '←'], 'Missed'],
              [['S'], 'Skip animation'],
              [['E'], 'Edit deck'],
              [['Esc'], 'End session / close'],
            ] as const
          ).flatMap(([keys, label]) => [h('dt', {}, kbd(...keys)), h('dd', {}, label)]),
        ),
      ),
    );
  }
}
