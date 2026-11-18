/**
 * Dates as the product's users read them (Sprint 2, CA-23).
 *
 * ## Why an explicit time zone
 *
 * `new Date(iso).toLocaleString()` uses whatever zone the browser or the server
 * happens to run in. A schedule that says "next run 05:00" would then mean a
 * different instant for the presenter in Medellín and for the CI runner in UTC,
 * and a screenshot in the verification manual would disagree with the database.
 * The sprint fixes the product time zone at `America/Bogota`, so this module
 * states it once and every surface formats through it.
 *
 * ## Why not store local time
 *
 * The database keeps instants (`timestamptz`). Only the rendering is localized:
 * a scan scheduled at 19:00 Bogotá is stored as 00:00 UTC the next day, and a
 * change of display format can never move a run.
 */

/** The zone the product presents times in. */
export const PRODUCT_TIME_ZONE = 'America/Bogota';

const formatter = new Intl.DateTimeFormat('es-CO', {
  timeZone: PRODUCT_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/**
 * `2026-01-03T00:00:00.000Z` → `02/01/2026, 19:00` (Bogotá is UTC-5).
 *
 * Returns an em dash for a missing or unparseable value so a table cell never
 * renders `Invalid Date`.
 */
export function formatProductDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';

  return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}`;
}
