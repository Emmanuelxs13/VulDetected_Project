import { Button, Container, EmptyState } from '@vuldetected/ui';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export default async function NotFound() {
  const t = await getTranslations('notFound');

  return (
    <Container size="narrow" className="py-12">
      <EmptyState
        title={t('title')}
        description={t('description')}
        action={
          <Button asChild variant="primary" size="sm">
            <Link href="/">{t('backToStart')}</Link>
          </Button>
        }
      />
    </Container>
  );
}
