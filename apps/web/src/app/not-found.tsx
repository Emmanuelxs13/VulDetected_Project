import { Button, Container, EmptyState } from '@vuldetected/ui';
import Link from 'next/link';

export default function NotFound() {
  return (
    <Container size="narrow" className="py-12">
      <EmptyState
        title="Page not found"
        description="That route does not exist in this build. Sprint 1 implements only the pages listed in the navigation."
        action={
          <Button asChild variant="primary" size="sm">
            <Link href="/">Back to start</Link>
          </Button>
        }
      />
    </Container>
  );
}
