import { t } from '../strings';
import { h } from './dom';

type Tone = 'primary' | 'danger' | 'plain';

export interface DialogAction<T> {
  label: string;
  value: T;
  tone?: Tone;
  /** Receives initial focus. Destructive dialogs focus the safe choice. */
  autofocus?: boolean;
}

export interface DialogSpec<T> {
  title: string;
  /** Body content; `close` lets forms inside the body resolve the dialog themselves. */
  body?: (close: (value: T) => void) => Array<Node | string | false | null | undefined>;
  actions?: Array<DialogAction<T>>;
  /** Value for Escape, backdrop click or the close button. */
  cancelValue: T;
  className?: string;
}

const TONE_CLASS: Record<Tone, string> = { primary: 'btn primary', danger: 'btn danger-solid', plain: 'btn' };

/**
 * In-app modal built on <dialog>.showModal(): the browser traps focus and makes the page inert.
 * Focus returns to whatever was focused before the dialog opened.
 */
export function openDialog<T>(spec: DialogSpec<T>): Promise<T> {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const dialog = h('dialog', { class: `dialog ${spec.className ?? ''}`.trim(), 'aria-label': spec.title });

  return new Promise<T>((resolve) => {
    let settled = false;
    const close = (value: T) => {
      if (settled) return;
      settled = true;
      dialog.close();
      dialog.remove();
      if (opener?.isConnected) opener.focus();
      resolve(value);
    };

    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      close(spec.cancelValue);
    });
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) close(spec.cancelValue);
    });

    const actions = spec.actions?.map((action) =>
      h(
        'button',
        { class: TONE_CLASS[action.tone ?? 'plain'], type: 'button', autofocus: action.autofocus, onclick: () => close(action.value) },
        action.label,
      ),
    );

    dialog.append(
      h(
        'div',
        { class: 'dialog-body' },
        h(
          'div',
          { class: 'drawer-head' },
          h('h2', {}, spec.title),
          h('button', { class: 'btn icon', type: 'button', 'aria-label': t.dialog.cancel, onclick: () => close(spec.cancelValue) }, '✕'),
        ),
        ...(spec.body?.(close) ?? []),
        actions?.length ? h('div', { class: 'dialog-actions' }, ...actions) : null,
      ),
    );
    document.body.append(dialog);
    dialog.showModal();
  });
}

export interface ConfirmOptions {
  title: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export function confirmDialog(message: string, { title, confirmLabel = t.dialog.ok, cancelLabel = t.dialog.cancel, danger = false }: ConfirmOptions): Promise<boolean> {
  return openDialog<boolean>({
    title,
    cancelValue: false,
    body: () => [h('p', { class: 'dialog-message' }, message)],
    actions: [
      { label: cancelLabel, value: false, autofocus: danger },
      { label: confirmLabel, value: true, tone: danger ? 'danger' : 'primary', autofocus: !danger },
    ],
  });
}

export interface PromptOptions {
  title: string;
  label: string;
  initial?: string;
  placeholder?: string;
  maxLength?: number;
  confirmLabel?: string;
}

/** Resolves to the entered text, or null when cancelled. */
export function promptDialog({ title, label, initial = '', placeholder, maxLength, confirmLabel = t.dialog.ok }: PromptOptions): Promise<string | null> {
  return openDialog<string | null>({
    title,
    cancelValue: null,
    body: (close) => {
      const input = h('input', { class: 'field', value: initial, placeholder, maxLength, 'aria-label': label, autofocus: true, dir: 'auto' });
      const submit = (event: Event) => {
        event.preventDefault();
        close(input.value);
      };
      return [
        h(
          'form',
          { class: 'dialog-form', onsubmit: submit },
          h('label', { class: 'field-label' }, label, input),
          h(
            'div',
            { class: 'dialog-actions' },
            h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, t.dialog.cancel),
            h('button', { class: 'btn primary', type: 'submit' }, confirmLabel),
          ),
        ),
      ];
    },
  });
}
