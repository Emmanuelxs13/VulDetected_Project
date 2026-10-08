'use client';

import { Alert, Button, Container } from '@vuldetected/ui';

/**
 * Route-level error boundary.
 *
 * `error.tsx` MUST be a Client Component — it receives the reset callback as a
 * prop and cannot render on the server.
 *
 * ## WHY THE MESSAGE IS SO VAGUE
 *
 * `error.message` is not shown. In production an unhandled server error can
 * contain a database URL, a column name, or a file path, and Next appends it to
 * the response in development. Echoing it into the UI would turn an error page
 * into an information-disclosure endpoint.
 *
 * The detail goes to the console, where it reaches the operator's logs and
 * nowhere else.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error('[route error]', error);

  return (
    <Container size="narrow" className="py-12">
      <Alert
        variant="critical"
        title="Something went wrong on this page"
        description="The error has been logged. Try again — if it persists, the detail is in the server logs."
      >
        {error.digest ? (
          <p className="font-mono text-xs text-text-muted">Reference: {error.digest}</p>
        ) : null}
      </Alert>

      <div className="mt-4">
        {/*
          `reset` re-renders the segment instead of reloading the document. It
          re-runs the Server Components, so a transient failure does not cost a
          full navigation — but it cannot fix a broken render loop, which is why a
          second failure should leave the user somewhere else to go.
        */}
        <Button variant="secondary" onClick={reset}>
          Try again
        </Button>
      </div>
    </Container>
  );
}
