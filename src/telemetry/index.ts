/**
 * Production telemetry, loaded after the app is on screen: cookieless aggregate page views
 * (Vercel Web Analytics) and, when a DSN is configured, crash reports (Sentry, EU region).
 * Neither carries an identifier for guests, and card text never leaves the device.
 */
export function startTelemetry(): void {
  startPageViews();
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (import.meta.env.PROD && dsn) {
    void import('./sentry').then(({ initSentry }) => initSentry(dsn)).catch((error: unknown) => console.warn('Crash reporting unavailable', error));
  }
}

/** Page views only, without query strings. The plain HTML pages use this on its own. */
export function startPageViews(): void {
  if (!import.meta.env.PROD) return;
  void import('@vercel/analytics')
    .then(({ inject }) =>
      inject({
        mode: 'production',
        beforeSend: (event) => ({ ...event, url: event.url.split(/[?#]/)[0] ?? event.url }),
      }),
    )
    .catch((error: unknown) => console.warn('Analytics unavailable', error));
}
