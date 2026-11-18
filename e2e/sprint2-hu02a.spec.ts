import { execFileSync } from 'node:child_process';

import { expect, test, type Page } from '@playwright/test';

/**
 * Sprint 2 · HU-02a (SCRUM-28) — social sign-in with Google and GitHub.
 *
 * ## What this proves that the unit tests cannot
 *
 * `lib/auth/social.test.ts` proves the *resolution*: which providers are armed,
 * what endpoints they point at, and that the account-linking policy is the one
 * ADR 0016 describes. That is a pure function, and a pure function never sends a
 * `Set-Cookie`. This spec drives a real browser through the real Better Auth
 * instance: it clicks the button, is redirected to the authorization endpoint,
 * gets an authorization code, exchanges it with PKCE, receives a userinfo
 * response, and ends up holding a session cookie that the server accepts.
 *
 * ## Why the provider is simulated, and why the spec says so
 *
 * The repository has no Google or GitHub credentials. `scripts/demo/
 * oauth-provider.mjs` implements the same OAuth 2.0 authorization-code + PKCE
 * flow against a fixed identity list, so the application's own decision layer —
 * linking, verification, session issuance — is exercised for real. What is NOT
 * proven here is that Google's specific endpoints and claims behave the same;
 * the manual states that limitation instead of hiding it.
 *
 * ## Why the criteria are separate tests
 *
 * Each criterion mutates the same three tables. Running them as one long test
 * would mean a failure in CA-30 hides whether CA-31 still holds, and the
 * verification manual reports per-criterion evidence. `resetSocial()` restores
 * the starting point before each one, so every test is independently re-runnable
 * and a single failure names exactly one criterion.
 */

const DEMO_EMAIL = 'demo.pro@vuldetected.local';
const DEMO_PASSWORD = 'VulDetected-Demo-2026!';
const MAILPIT = 'http://localhost:8025';

/**
 * Restores the social criteria's starting point.
 *
 * CA-30 needs a mailbox that does not exist yet, and CA-31 needs `demo.pro` to
 * have no Google link. Both conditions are destroyed by the previous run, so a
 * spec that skips this passes once and then quietly stops testing what it claims.
 */
function resetSocial(): void {
  execFileSync('node', ['apps/web/scripts/demo/reset-social.mjs'], { stdio: 'pipe' });
}

/** The server's own view of the current session. */
async function currentSession(page: Page): Promise<{
  user: { id: string; email: string; emailVerified: boolean; name: string } | null;
}> {
  const response = await page.request.get('/api/auth/get-session');
  expect(response.ok()).toBe(true);

  /**
   * With no session the endpoint answers a bare `null`, not `{ user: null }`.
   * Normalising here keeps every assertion readable as `session.user`.
   */
  const body = (await response.json()) as {
    user?: { id: string; email: string; emailVerified: boolean; name: string };
  } | null;
  return { user: body?.user ?? null };
}

/** How many messages Mailpit has delivered to an address. */
async function mailCount(page: Page, address: string): Promise<number> {
  const response = await page.request.get(`${MAILPIT}/api/v1/messages?limit=200`);
  const body = (await response.json()) as {
    messages: { To: { Address: string }[]; Subject: string }[];
  };
  return body.messages.filter((message) =>
    message.To.some((to) => to.Address.toLowerCase() === address.toLowerCase()),
  ).length;
}

/**
 * Waits for a mail count to satisfy `predicate`.
 *
 * The application does not hand messages to Mailpit directly: it queues them and
 * a dispatcher polls every five seconds. Asserting immediately after the
 * sign-in would race that poller and fail for a reason unrelated to the
 * criterion.
 */
async function waitForMail(
  page: Page,
  address: string,
  predicate: (count: number) => boolean,
  timeoutMs = 30_000,
): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  let count = await mailCount(page, address);

  while (!predicate(count) && Date.now() < deadline) {
    await page.waitForTimeout(500);
    count = await mailCount(page, address);
  }

  return count;
}

async function signInWithPassword(page: Page): Promise<void> {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(DEMO_EMAIL);
  await page.locator('input[name="password"]').fill(DEMO_PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();

  /**
   * Assert the invariant, not the landing page.
   *
   * `logoutAction` redirects to `/dashboard`, which is itself protected, so where
   * the browser ends up depends on whether Next performs a navigation for a
   * redirect to the current path and on what the middleware does next. What the
   * criterion actually requires is that the session is gone, so that is what is
   * polled — and the rest of the flow re-enters through `/login` explicitly.
   */
  await expect
    .poll(async () => (await currentSession(page)).user, { timeout: 30_000 })
    .toBeNull();
}

/**
 * Walks the real flow: product button → provider chooser → authorization code →
 * the application's callback. Returns the final URL, which is either the
 * dashboard (the app accepted the sign-in) or the login screen with an `error`
 * parameter (it refused).
 */
async function signInWithProvider(
  page: Page,
  provider: 'google' | 'github',
  identity: string,
): Promise<URL> {
  await page.goto('/login');

  const label = provider === 'google' ? 'Continuar con Google' : 'Continuar con GitHub';
  await page.getByRole('button', { name: label }).click();

  // The client fetches the authorization URL and then navigates to it.
  await page.waitForURL(/127\.0\.0\.1:8100\/oauth\//, { timeout: 30_000 });

  // The chooser is the provider's consent screen. The banner is asserted because
  // a reader of the recording must be able to tell this is not Google.
  await expect(page.getByText('PROVEEDOR DE IDENTIDAD SIMULADO')).toBeVisible();

  await page.locator(`input[name="identity"][value="${identity}"]`).check();
  await page.getByRole('button', { name: 'Autorizar y volver a VulDetected' }).click();

  // Land on the product again. Matching on the error parameter keeps this from
  // resolving against the `/login` page the test started on.
  await page.waitForURL(
    (url) =>
      url.port === '3000' &&
      (url.pathname === '/dashboard' || url.searchParams.has('error')),
    { timeout: 60_000 },
  );

  return new URL(page.url());
}

test.describe('Sprint 2 — HU-02a', () => {
  test.beforeEach(() => {
    resetSocial();
  });

  test('CA-30: a new Google account is created, verified by the provider, and signed in', async ({
    page,
  }) => {
    const mailsBefore = await mailCount(page, 'ana.nueva@demo.vuldetected.dev');

    const landed = await signInWithProvider(page, 'google', 'nueva-verificada');
    expect(landed.pathname, `expected the dashboard, got ${landed.href}`).toBe('/dashboard');

    const session = await currentSession(page);
    expect(session.user).not.toBeNull();
    expect(session.user!.email).toBe('ana.nueva@demo.vuldetected.dev');
    expect(session.user!.name).toBe('Ana Nueva');

    /**
     * ADR 0017, literal reading of CA-30: the account starts verified because the
     * provider asserts the address, and no confirmation email is sent. Better Auth
     * only sends one for an unverified address, so this is the observable
     * consequence of `requireEmailVerification: false` plus a verified claim.
     */
    expect(session.user!.emailVerified, 'the provider asserted the address').toBe(true);

    /**
     * Give the dispatcher one full poll cycle (five seconds) before concluding
     * that nothing was queued: asserting immediately would pass for the wrong
     * reason, because the absence of a message at t=0 proves nothing.
     */
    await page.waitForTimeout(8_000);
    expect(
      await mailCount(page, 'ana.nueva@demo.vuldetected.dev'),
      'a verified address must not receive a confirmation email',
    ).toBe(mailsBefore);

    console.log(`[CA-30] created and signed in as ${session.user!.email}, emailVerified=true, no mail sent`);
  });

  test('CA-30 (ADR 0017): a new account whose provider does NOT assert verification gets the email', async ({
    page,
  }) => {
    const address = 'beto.sinverificar@demo.vuldetected.dev';
    const mailsBefore = await mailCount(page, address);

    const landed = await signInWithProvider(page, 'google', 'nueva-sin-verificar');
    expect(landed.pathname).toBe('/dashboard');

    const session = await currentSession(page);
    expect(session.user!.email).toBe(address);

    // Signed in — that is the literal reading — but the address is not trusted.
    expect(session.user!.emailVerified).toBe(false);

    const after = await waitForMail(page, address, (count) => count > mailsBefore);
    expect(
      after,
      'an unverified address must receive exactly one confirmation email',
    ).toBe(mailsBefore + 1);

    console.log(`[CA-30] ${address} signed in with emailVerified=false and one confirmation email queued`);
  });

  test('CA-31: an existing verified account is linked to Google and signs in', async ({ page }) => {
    // Capture the identity of the account that already exists, so "linked" can be
    // proven instead of inferred: the Google sign-in must land on this same row.
    await signInWithPassword(page);
    const before = await currentSession(page);
    expect(before.user!.email).toBe(DEMO_EMAIL);
    await signOut(page);

    const landed = await signInWithProvider(page, 'google', 'local-verificada');
    expect(landed.pathname, `expected the dashboard, got ${landed.href}`).toBe('/dashboard');

    const after = await currentSession(page);
    expect(after.user!.email).toBe(DEMO_EMAIL);
    expect(
      after.user!.id,
      'CA-31 links to the existing account; a new user row would mean a duplicate',
    ).toBe(before.user!.id);

    console.log(`[CA-31] linked Google to the existing ${DEMO_EMAIL} (user ${after.user!.id})`);
  });

  test('ADR 0016: an existing account that never verified its mailbox is not linked', async ({
    page,
  }) => {
    const landed = await signInWithProvider(page, 'google', 'local-sin-verificar');

    expect(landed.pathname).toBe('/login');
    expect(landed.searchParams.get('error')).toBe('account_not_linked');
    await expect(
      page.getByText(/Ya existe una cuenta con ese correo y todavía no está vinculada/),
    ).toBeVisible();

    const session = await currentSession(page);
    expect(session.user, 'the refusal must not issue a session').toBeNull();

    console.log('[ADR 0016] unverified local account refused with account_not_linked, no session issued');
  });

  test('ADR 0016: an existing account is not linked when the provider does not assert the address', async ({
    page,
  }) => {
    const landed = await signInWithProvider(page, 'google', 'local-verificada-proveedor-duda');

    expect(landed.pathname).toBe('/login');
    expect(landed.searchParams.get('error')).toBe('account_not_linked');

    const session = await currentSession(page);
    expect(session.user, 'the refusal must not issue a session').toBeNull();

    console.log('[ADR 0016] provider-unverified claim refused with account_not_linked, no session issued');
  });

  test('CA-32: sign out and sign back in with Google', async ({ page }) => {
    // First sign-in creates the link, which is the state CA-32 describes.
    await signInWithProvider(page, 'google', 'local-verificada');
    const first = await currentSession(page);
    expect(first.user!.email).toBe(DEMO_EMAIL);

    await signOut(page);

    // Second sign-in resolves the account by its provider link, not by email.
    const landed = await signInWithProvider(page, 'google', 'local-verificada');
    expect(landed.pathname).toBe('/dashboard');

    const second = await currentSession(page);
    expect(second.user!.email).toBe(DEMO_EMAIL);
    expect(second.user!.id).toBe(first.user!.id);

    console.log(`[CA-32] signed out and back in with Google as ${second.user!.email}`);
  });

  test('CA-30-GH (proposed): a new GitHub account is created and signed in', async ({ page }) => {
    const landed = await signInWithProvider(page, 'github', 'nueva-verificada');
    expect(landed.pathname).toBe('/dashboard');

    const session = await currentSession(page);
    expect(session.user!.email).toBe('carla.nueva@demo.vuldetected.dev');
    expect(session.user!.emailVerified).toBe(true);

    console.log(`[CA-30-GH] created and signed in as ${session.user!.email}`);
  });
});
