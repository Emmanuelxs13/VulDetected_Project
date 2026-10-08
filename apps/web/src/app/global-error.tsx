'use client';

import { Button } from '@vuldetected/ui';

/**
 * Root error boundary — the last one before the browser's own error page.
 *
 * Replaces `<html>`/`<body>` wholesale, which is why it cannot use the layout and
 * therefore has to provide its own document shell. That is also why it styles with
 * plain Tailwind rather than the design system: importing UI components here risks
 * pulling in the same module graph that just failed.
 *
 * `error.message` is logged, never rendered — same reason as `error.tsx`.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error('[global error]', error);

  return (
    <html lang="es">
      <body
        style={{
          display: 'flex',
          minHeight: '100dvh',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
          fontFamily: 'var(--font-geist-sans, ui-sans-serif), system-ui, -apple-system, sans-serif',
        }}
      >
        <main style={{ maxWidth: '32rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0 }}>
              The application could not start
            </h1>
            <p
              style={{
                fontSize: '0.875rem',
                color: 'var(--color-text-muted, #545d6b)',
                marginTop: '0.5rem',
                lineHeight: 1.5,
              }}
            >
              This is usually a misconfigured environment rather than a bug. Check that{' '}
              <code>DATABASE_URL</code>, <code>AUTH_SECRET</code> and <code>AUTH_URL</code> are set,
              then try again.
            </p>
          </div>

          {error.digest ? (
            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle, #6e7887)' }}>
              Reference: {error.digest}
            </p>
          ) : null}

          <div>
            <Button variant="primary" onClick={reset}>
              Reload
            </Button>
          </div>
        </main>
      </body>
    </html>
  );
}
