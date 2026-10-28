import { redirect } from 'next/navigation';

/**
 * Legacy entry point.
 *
 * The simulated "new scan" screen generated a verification token in the browser
 * and never contacted the server. The real ownership flow lives in the scans
 * page, so this route only forwards old links to it.
 */
export default function LegacyNewScanPage() {
  redirect('/scans');
}
