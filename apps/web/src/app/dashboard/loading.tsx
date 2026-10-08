import { Container, SkeletonRow } from '@vuldetected/ui';

/**
 * Route-level loading state.
 *
 * `loading.tsx` wraps a segment in a Suspense boundary, so this appears the moment
 * the navigation starts rather than after the server component finishes.
 *
 * `SkeletonRow` is used rather than a spinner because the layout of the dashboard
 * is known — a table-shaped placeholder keeps the content from jumping when real
 * data arrives, whereas a centred spinner makes the page shift twice.
 */
export default function Loading() {
  return (
    <Container size="narrow" className="flex flex-col gap-6 py-12">
      <div className="flex flex-col gap-2">
        <div className="h-6 w-48 rounded-md bg-surface-raised" />
        <div className="h-4 w-64 rounded-md bg-surface" />
      </div>
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-raised p-4">
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    </Container>
  );
}
