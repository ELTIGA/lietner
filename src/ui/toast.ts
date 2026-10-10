import { h } from './dom';

export interface ToastOptions {
  action?: { label: string; onClick: () => void };
  /** Milliseconds before it hides itself; 0 keeps it until dismissed. */
  duration?: number;
  tone?: 'info' | 'error';
}

export interface ToastHandle {
  dismiss(): void;
}

let region: HTMLElement | null = null;

function toastRegion(): HTMLElement {
  if (!region?.isConnected) {
    region = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(region);
  }
  return region;
}

/** Small message at the bottom of the screen, optionally with one action (Undo, Reload). */
export function showToast(message: string, { action, duration = 5000, tone = 'info' }: ToastOptions = {}): ToastHandle {
  let timer = 0;
  const element = h('div', { class: `toast ${tone}` }, h('span', { class: 'toast-message' }, message));
  const dismiss = () => {
    window.clearTimeout(timer);
    element.classList.add('leaving');
    window.setTimeout(() => element.remove(), 180);
  };
  if (action) {
    element.append(
      h(
        'button',
        {
          class: 'btn small toast-action',
          type: 'button',
          onclick: () => {
            dismiss();
            action.onClick();
          },
        },
        action.label,
      ),
    );
  }
  toastRegion().append(element);
  if (duration > 0) timer = window.setTimeout(dismiss, duration);
  return { dismiss };
}

/** Shows a LimitError (or any Error) message; logs anything unexpected. */
export function showError(error: unknown, fallback: string): void {
  if (!(error instanceof Error && error.name === 'LimitError')) console.error(error);
  showToast(error instanceof Error && error.name === 'LimitError' ? error.message : fallback, { tone: 'error' });
}
