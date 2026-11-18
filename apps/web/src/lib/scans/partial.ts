/**
 * Comparability decision for a finished scan (Sprint 2, CA-22 / CA-29).
 *
 * ## Why this is its own module
 *
 * "Was this run complete?" decides three separate things: whether the findings
 * may enter the comparative history, whether they may feed the traffic light,
 * and whether the next scan may use this run as the baseline for "new
 * vulnerability". Getting it wrong in one place and right in another would make
 * the chart and the alerts disagree about the same scan, so the rule lives here
 * once and every caller asks the same function.
 *
 * ## Why a cancelled run is always partial
 *
 * Even if the worker happened to finish its last check a millisecond before the
 * flag landed, the run is the one the user stopped. Its result set is whatever
 * the worker had collected at that moment, which is not a full pass over the
 * target. Calling it complete would let a cancellation quietly change the
 * history.
 */

export type TerminalScanStatus = 'completed' | 'failed' | 'cancelled';

export interface PartialScanInput {
  /** The status the callback reports for this run. */
  status: TerminalScanStatus;
  /** Checks the scan was enqueued with. Empty when the row has no check list. */
  requestedChecks: readonly string[];
  /** Checks the worker says it finished. */
  ranChecks: readonly string[];
  /** The row was already `cancelled` when the callback arrived. */
  alreadyCancelled?: boolean;
}

/**
 * True when the run finished without covering its whole check set.
 *
 * A `failed` run is not "partial": it did not produce a usable result set at
 * all, and the queries that matter already exclude it by status. The flag is
 * for runs whose findings ARE kept and therefore need to be excluded from
 * comparison explicitly.
 */
export function isPartialScan(input: PartialScanInput): boolean {
  if (input.status === 'cancelled' || input.alreadyCancelled === true) {
    return true;
  }

  if (input.status === 'failed') {
    return false;
  }

  if (input.requestedChecks.length === 0) {
    return false;
  }

  return input.ranChecks.length < input.requestedChecks.length;
}
