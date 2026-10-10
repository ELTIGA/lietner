import type { ErrorEvent } from '@sentry/browser';
import { describe, expect, it } from 'vitest';

import { scrubBreadcrumb, scrubEvent, scrubText } from './scrub';

describe('telemetry scrubbing', () => {
  it('drops typing and console breadcrumbs', () => {
    expect(scrubBreadcrumb({ category: 'ui.input', message: 'textarea "hola"' })).toBeNull();
    expect(scrubBreadcrumb({ category: 'console', message: 'card mañana', data: { arguments: ['mañana'] } })).toBeNull();
  });

  it('removes click selectors, which can contain aria-labels with card text', () => {
    const crumb = scrubBreadcrumb({ category: 'ui.click', message: 'button.btn[aria-label="Delete card el perro"]' });
    expect(crumb).toEqual({ category: 'ui.click', message: undefined, data: undefined });
  });

  it('strips query strings from request breadcrumbs', () => {
    const crumb = scrubBreadcrumb({ category: 'fetch', data: { url: 'https://x.supabase.co/rest/v1/cards?select=front', method: 'GET' } });
    expect(crumb?.data).toEqual({ url: 'https://x.supabase.co/rest/v1/cards', method: 'GET' });
  });

  it('blanks quoted text in messages', () => {
    expect(scrubText('Failed to save “la casa” to "deck"')).toBe('Failed to save “…” to "…"');
  });

  it('keeps only technical context on events', () => {
    const event = {
      type: undefined,
      message: 'Delete “mañana”?',
      extra: { card: 'mañana' },
      user: { id: '1', ip_address: '1.2.3.4' },
      contexts: { browser: { name: 'Chrome' }, state: { card: 'mañana' } },
      request: { url: 'https://lietner.app/?today=3', headers: { 'User-Agent': 'UA', Cookie: 'x' }, data: 'body' },
      exception: { values: [{ type: 'Error', value: 'Bad card "hola"' }] },
      breadcrumbs: [
        { category: 'console', message: 'hola' },
        { category: 'navigation', data: { from: '/?a=1', to: '/privacy' } },
      ],
    } as unknown as ErrorEvent;
    const scrubbed = scrubEvent(event);
    expect(JSON.stringify(scrubbed)).not.toMatch(/mañana|hola|1\.2\.3\.4|Cookie|today=3|body/);
    expect(scrubbed.contexts).toEqual({ browser: { name: 'Chrome' } });
    expect(scrubbed.request).toEqual({ url: 'https://lietner.app/', headers: { 'User-Agent': 'UA' } });
    expect(scrubbed.breadcrumbs).toEqual([{ category: 'navigation', data: { from: '/', to: '/privacy' } }]);
  });
});
