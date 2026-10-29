import { Container, Skeleton } from '@vuldetected/ui';

export default function Loading() {
  return (
    <Container size="default" className="flex flex-col gap-6 py-8">
      <Skeleton className="h-8 w-40" />
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-20" />
        ))}
      </div>
      <Skeleton className="h-96 w-full" />
    </Container>
  );
}
