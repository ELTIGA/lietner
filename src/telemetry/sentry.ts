import * as Sentry from '@sentry/browser';

import { scrubBreadcrumb, scrubEvent } from './scrub';

/** Crash reports only: no PII, no session replay, no performance tracing, card text scrubbed. */
export function initSentry(dsn: string): void {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // Sentry 11's replacement for `sendDefaultPii: false`: collect no user, cookie, header,
    // query or body data at all.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
    },
    tracesSampleRate: 0,
    integrations: (defaults) => defaults.filter((integration) => integration.name !== 'BrowserSession'),
    beforeBreadcrumb: scrubBreadcrumb,
    beforeSend: scrubEvent,
  });
}
