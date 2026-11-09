import type { ScanStatus } from './components/scan-status';

/** True for the states the scan never leaves on its own. */
export function isTerminalStatus(status: ScanStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

/** True while the scan is still working. */
export function isActiveStatus(status: ScanStatus): boolean {
  return status === 'queued' || status === 'running';
}
