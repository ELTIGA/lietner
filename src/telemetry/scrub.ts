import type { Breadcrumb, ErrorEvent } from '@sentry/browser';

/**
 * Card text must never reach Sentry. Lietner's own messages never include it, but DOM
 * selectors (aria-labels), console arguments and quoted strings in error messages could,
 * so those are removed before anything is sent.
 */

const QUOTED = /(["“‘'«])(?:(?!\1).){1,}?(["”’'»])/gu;
const KEPT_CONTEXTS = new Set(['browser', 'os', 'device', 'runtime', 'culture', 'trace']);

export function scrubText(text: string): string {
  return text.replace(QUOTED, '$1…$2');
}

function stripQuery(url: string): string {
  const index = url.search(/[?#]/);
  return index === -1 ? url : url.slice(0, index);
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  const { category } = breadcrumb;
  // Typing and console output can carry card text.
  if (category === 'ui.input' || category === 'console') return null;
  if (category?.startsWith('ui.')) {
    // Click selectors include aria-labels such as "Delete card <front>".
    return { ...breadcrumb, message: undefined, data: undefined };
  }
  if (category === 'fetch' || category === 'xhr') {
    const url = breadcrumb.data?.url;
    return { ...breadcrumb, data: { ...breadcrumb.data, url: typeof url === 'string' ? stripQuery(url) : undefined } };
  }
  if (category === 'navigation') {
    const { from, to } = (breadcrumb.data ?? {}) as { from?: string; to?: string };
    return { ...breadcrumb, data: { from: from && stripQuery(from), to: to && stripQuery(to) } };
  }
  return { ...breadcrumb, message: breadcrumb.message && scrubText(breadcrumb.message) };
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const scrubbed: ErrorEvent = { ...event };
  delete scrubbed.extra;
  delete scrubbed.user;
  delete scrubbed.server_name;
  if (scrubbed.contexts) {
    scrubbed.contexts = Object.fromEntries(Object.entries(scrubbed.contexts).filter(([key]) => KEPT_CONTEXTS.has(key)));
  }
  if (scrubbed.request) {
    scrubbed.request = { url: scrubbed.request.url && stripQuery(scrubbed.request.url), headers: scrubbed.request.headers?.['User-Agent'] ? { 'User-Agent': scrubbed.request.headers['User-Agent'] } : undefined };
  }
  if (scrubbed.message) scrubbed.message = scrubText(scrubbed.message);
  if (scrubbed.exception?.values) {
    scrubbed.exception = {
      ...scrubbed.exception,
      values: scrubbed.exception.values.map((value) => ({ ...value, value: value.value && scrubText(value.value) })),
    };
  }
  if (scrubbed.breadcrumbs) {
    scrubbed.breadcrumbs = scrubbed.breadcrumbs.map(scrubBreadcrumb).filter((crumb): crumb is Breadcrumb => crumb !== null);
  }
  return scrubbed;
}
