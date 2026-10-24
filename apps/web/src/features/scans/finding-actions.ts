'use server';

import { and, eq, findings, domains, scans } from '@vuldetected/db';
import { revalidatePath } from 'next/cache';

import { getCurrentUserId } from '@/features/auth/session';
import { db } from '@/lib/db';

export async function updateFindingStatusAction(
  findingId: string,
  status: 'open' | 'false_positive' | 'resolved',
) {
  const userId = await getCurrentUserId();
  if (!userId) return { ok: false as const, error: 'unauthorized' as const };

  const owned = await db()
    .select({ id: findings.id, scanId: findings.scanId })
    .from(findings)
    .innerJoin(scans, eq(findings.scanId, scans.id))
    .innerJoin(domains, eq(scans.domainId, domains.id))
    .where(and(eq(findings.id, findingId), eq(domains.userId, userId)))
    .limit(1);

  const finding = owned[0];
  if (!finding) return { ok: false as const, error: 'not_found' as const };

  await db().update(findings).set({ status }).where(eq(findings.id, finding.id));
  revalidatePath(`/scans/${finding.scanId}`);
  revalidatePath('/dashboard');
  return { ok: true as const };
}
