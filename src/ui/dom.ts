type Child = Node | string | null | undefined | false;
type Props = Record<string, unknown> & { class?: string; dataset?: Record<string, string> };

/** Minimal element factory: `h('button', { class: 'btn', onclick }, 'Label')`. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') element.className = String(value);
    else if (key === 'dataset') Object.assign(element.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') element.addEventListener(key.slice(2), value as EventListener);
    else if (key in element) (element as unknown as Record<string, unknown>)[key] = value;
    else element.setAttribute(key, String(value));
  }
  for (const child of children) if (child) element.append(child);
  return element;
}

export function kbd(...keys: string[]): HTMLElement {
  return h('span', { class: 'keys', 'aria-hidden': 'true' }, ...keys.map((key) => h('kbd', {}, key)));
}

export function downloadText(filename: string, text: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = h('a', { href: url, download: filename, hidden: true });
  document.body.append(link);
  link.click();
  link.remove();
  // Safari aborts the download if the URL is revoked synchronously.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function isTyping(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null;
  return !!target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

/** True while any modal <dialog> is open; global shortcuts stand down. */
export function anyDialogOpen(): boolean {
  return document.querySelector('dialog[open]') !== null;
}

/**
 * Keeps `--kb-inset` on `element` equal to the height the on-screen keyboard covers, so CSS can lift
 * bottom-anchored content above it. Returns a function that stops watching.
 */
export function watchKeyboardInset(element: HTMLElement): () => void {
  const viewport = window.visualViewport;
  if (!viewport) return () => {};
  const update = () => {
    const covered = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
    element.style.setProperty('--kb-inset', `${Math.round(covered)}px`);
  };
  viewport.addEventListener('resize', update);
  update();
  return () => {
    viewport.removeEventListener('resize', update);
    element.style.removeProperty('--kb-inset');
  };
}
