import { Container, Skeleton } from '@vuldetected/ui';

export default function Loading() {
  return (
    <Container size="default" className="flex flex-col gap-6 py-8">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-64 w-full" />
    </Container>
  );
}
