import { Container, Skeleton } from '@vuldetected/ui';

export default function Loading() {
  return (
    <Container size="default" className="flex flex-col gap-6 py-8">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-10 w-80" />
      <Skeleton className="h-64 w-full" />
    </Container>
  );
}
