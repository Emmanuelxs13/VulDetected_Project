import { redirect } from 'next/navigation';

/**
 * Legacy entry point.
 *
 * The active-scans screen used to be a static "nothing running" card while the
 * real list lived at `/scans`. The scan list already shows every status, so this
 * route exists only to keep old links working instead of returning a 404.
 */
export default function ActiveScansPage() {
  redirect('/scans');
}
