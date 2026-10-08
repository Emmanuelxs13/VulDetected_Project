'use client';

import { Button } from '@vuldetected/ui';
// React 19 moved `useFormStatus` out of `react` and into `react-dom`.
import { useFormStatus } from 'react-dom';

import { logoutAction } from './actions';

/**
 * Sign-out control.
 *
 * A `<form>` posting a Server Action rather than a click handler, for a reason
 * that has nothing to do with taste: a click handler is JavaScript, so it does
 * not run if hydration has not completed or fails, and it cannot be triggered by
 * anything that respects CSRF. A form action runs on the server with the request,
 * which is where session revocation belongs.
 *
 * Next still sends it as a POST, so this is not a GET — a state-changing GET
 * would be revokable by a link, an `<img>`, or a browser prefetch.
 */
export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <LogoutSubmit />
    </form>
  );
}

function LogoutSubmit() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="secondary" size="sm" loading={pending}>
      Sign out
    </Button>
  );
}
