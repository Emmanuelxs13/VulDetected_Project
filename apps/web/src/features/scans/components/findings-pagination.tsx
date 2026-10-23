import { Button } from '@vuldetected/ui';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

export interface FindingsPaginationProps {
  basePath: string;
  params: Record<string, string | undefined>;
  nextCursor: string | null;
  /** True when the reader is past the first page, which re-enables the "first page" link. */
  isPaged: boolean;
}

function hrefFor(basePath: string, params: Record<string, string | undefined>, cursor?: string) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      search.set(key, value);
    }
  }
  if (cursor) {
    search.set('cursor', cursor);
  } else {
    search.delete('cursor');
  }

  const query = search.toString();
  return query ? `${basePath}?${query}` : basePath;
}

/**
 * Cursor navigation for a findings table.
 *
 * Forward-only by design: a keyset cursor cannot be reversed without keeping the
 * cursor of the previous page, so "first page" is offered instead of "previous".
 */
export async function FindingsPagination({
  basePath,
  params,
  nextCursor,
  isPaged,
}: FindingsPaginationProps) {
  const t = await getTranslations('scan');

  if (!nextCursor && !isPaged) {
    return null;
  }

  return (
    <nav
      className="flex items-center justify-end gap-2"
      aria-label={t('findings.pagination.label')}
    >
      {isPaged ? (
        <Button asChild variant="ghost" size="sm">
          <Link href={hrefFor(basePath, params)}>{t('findings.pagination.first')}</Link>
        </Button>
      ) : null}
      {nextCursor ? (
        <Button asChild variant="secondary" size="sm">
          <Link href={hrefFor(basePath, params, nextCursor)}>{t('findings.pagination.next')}</Link>
        </Button>
      ) : null}
    </nav>
  );
}
