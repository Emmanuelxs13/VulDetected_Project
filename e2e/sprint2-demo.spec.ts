import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';

/**
 * Sprint 2 · the eight-step demo, driven end to end in a real browser.
 *
 * ## What this file is
 *
 * It is the executable version of the demo script in `PRUEBA_SPRINT_2.md`. Each
 * step is one thing a presenter does in front of an audience, and each one ends
 * with a screenshot in `docs/capturas/sprint-2/` so the manual can show what the
 * audience is supposed to see.
 *
 * ## Why it resets first
 *
 * A demo that only works the first time is not a demo. The file starts from the
 * same clean state the manual documents (`demo:reset`, `demo:seed-history`,
 * `demo:reset-billing`, `demo:reset-social`) and clears the mailbox, so three
 * consecutive runs produce the same story instead of three different ones.
 *
 * ## What it deliberately does not do
 *
 * It does not assert a verdict. A demo is a narrative; the per-criterion proof
 * lives in `sprint2-hu06.spec.ts`, `sprint2-hu07.spec.ts`, `sprint2-hu09.spec.ts`,
 * `sprint2-hu10.spec.ts`, `sprint2-hu02a.spec.ts`, `sprint2-hu02b.spec.ts` and
 * `sprint2-hu04.spec.ts`. Here the assertions only protect the story from
 * silently degrading into "the presenter clicked and nothing happened".
 *
 * ADR 0019 (billing) and ADR 0020 (authenticated scanning) mark the two steps
 * that run in demonstration mode.
 */

test.describe.configure({ mode: 'serial' });

const FIXTURE_BASE = 'http://127-0-0-1.nip.io:8099';
const MAILPIT_BASE = 'http://localhost:8025';
const HOST = '127-0-0-1.nip.io';

/**
 * The same base URL the config hands to the test's own page.
 *
 * A context created with `browser.newContext()` gets none of the `use` options,
 * so a relative `goto` there would throw "Invalid URL". The warm-up is the only
 * place in this file that builds a context by hand, so the value is repeated
 * here rather than read from the config.
 */
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

const DEMO_PRO = { email: 'demo.pro@vuldetected.local', password: 'VulDetected-Demo-2026!' };
const DEMO_FREE = { email: 'demo.free@vuldetected.local', password: 'VulDetected-Demo-2026!' };

const FIXTURE_USER = 'demo@miapp.local';
const FIXTURE_PASSWORD = 'Fixture-Pass-2026!';
const SUCCESS_MARKER = 'Invoice 2026-001';

const APPROVED_CARD = '4242 4242 4242 4242';

const SHOTS = join('docs', 'capturas', 'sprint-2');
const DEMO_DIR = join('docs', 'demo');
const TIMINGS = join('test-results', 'sprint2-demo-timings.json');

interface MailpitMessage {
  ID: string;
  Subject: string;
  Created: string;
  To: Array<{ Address: string }>;
}

interface StepTiming {
  step: number;
  name: string;
  ms: number;
}

const timings: StepTiming[] = [];

/**
 * The scan the scheduler produced in step 3.
 *
 * Step 4 exports the PDF of THAT scan: it is the one the audience just watched
 * arrive on its own, so the document and the story are about the same run.
 */
let scheduledScanId = '';

/**
 * Runs one demo step and records how long it took.
 *
 * The timing is the number the manual quotes, so it is measured around the
 * presenter's actions only — not around the reset, the sign-in or the waits a
 * human does not perform. The file is rewritten after every step, so a run that
 * fails halfway still leaves the numbers it measured.
 */
async function step(n: number, name: string, body: () => Promise<void>): Promise<void> {
  const started = Date.now();
  await body();
  const ms = Date.now() - started;
  timings.push({ step: n, name, ms });
  console.log(`[demo] paso ${n} — ${name}: ${(ms / 1_000).toFixed(1)} s`);
  writeTimings();
}

function writeTimings(): void {
  mkdirSync('test-results', { recursive: true });
  writeFileSync(
    TIMINGS,
    `${JSON.stringify({ run: new Date().toISOString(), steps: timings }, null, 2)}\n`,
    'utf8',
  );
}

async function shot(page: Page, name: string, fullPage = false): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage });
}

/** Runs one demo accelerator exactly as the manual tells the presenter to. */
function runDemoScript(script: string, args: string[] = []): string {
  return execFileSync(process.execPath, [join('apps', 'web', 'scripts', 'demo', script), ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/**
 * Puts the demo database back to the documented starting point.
 *
 * Order matters: the full reset recreates the demo users, the history seeder
 * needs those users to own the domain, and the billing reset reads the plans the
 * seeder just wrote.
 */
function resetDemoState(): void {
  for (const script of ['reset.mjs', 'seed-history.mjs', 'reset-billing.mjs', 'reset-social.mjs']) {
    runDemoScript(script);
  }
}

async function signIn(page: Page, account: { email: string; password: string }): Promise<void> {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(account.email);
  await page.locator('input[name="password"]').fill(account.password);
  await page.locator('form button[type="submit"]').click({ timeout: 60_000 });
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 60_000 });
}

async function signOut(page: Page): Promise<void> {
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Cerrar sesión' }).click({ timeout: 60_000 });

  /**
   * Two assertions, for two different reasons.
   *
   * The poll checks the invariant the criterion cares about — the server no
   * longer knows this session — and it is tolerant of a slow dev server.
   *
   * The navigation is the user-visible proof: asking for a protected page lands
   * on the sign-in screen instead of on the account's data. It has to be a fresh
   * navigation because the client router can leave the address bar on
   * `/dashboard` after a server-action redirect even though the session is gone.
   */
  await expect
    .poll(
      async () =>
        (await page.request.get('/api/auth/get-session', { timeout: 60_000 })).json(),
      { timeout: 90_000 },
    )
    .toBeNull();

  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login/, { timeout: 60_000 });
  await expect(page.locator('input[name="email"]')).toBeVisible({ timeout: 30_000 });
}

async function setSlow(request: APIRequestContext, ms: number): Promise<void> {
  const response = await request.post(`${FIXTURE_BASE}/__demo/slow/ms?value=${ms}`);

  if (!response.ok()) {
    // Older fixture builds expose only on/off; fall back so the demo still runs.
    await request.post(`${FIXTURE_BASE}/__demo/slow/${ms > 0 ? 'on' : 'off'}`);
  }
}

async function setSqli(request: APIRequestContext, enabled: boolean): Promise<void> {
  const response = await request.post(`${FIXTURE_BASE}/__demo/sqli/${enabled ? 'on' : 'off'}`);
  expect(response.ok(), 'the fixture must accept the SQLi toggle').toBe(true);
}

async function listMail(request: APIRequestContext): Promise<MailpitMessage[]> {
  const response = await request.get(`${MAILPIT_BASE}/api/v1/messages?limit=100`);
  expect(response.ok(), 'Mailpit must be reachable (dev:all starts it)').toBe(true);

  const body = (await response.json()) as { messages: MailpitMessage[] };

  return body.messages;
}

/** Polls the mailbox until a message with that subject shows up. */
async function waitForMail(
  request: APIRequestContext,
  subjectIncludes: string,
  timeoutMs: number,
): Promise<MailpitMessage | undefined> {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const found = (await listMail(request)).find((message) =>
      message.Subject.includes(subjectIncludes),
    );
    if (found !== undefined || Date.now() >= deadline) {
      return found;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
}

async function submitScan(page: Page): Promise<string> {
  await page.goto('/scanner');
  await page.locator('input[name="hostname"]').fill(HOST);
  await page.getByRole('button', { name: 'Solicitar reto de verificación' }).click();

  await page.locator('input[name="targetUrl"]').fill(`${FIXTURE_BASE}/`);
  await page.getByRole('button', { name: 'Escanear', exact: true }).click();

  const progressLink = page.getByRole('link', { name: 'Ver progreso del escaneo' });
  await expect(progressLink).toBeVisible({ timeout: 30_000 });

  const href = await progressLink.getAttribute('href');
  expect(href).toMatch(/^\/scans\/[0-9a-f-]{36}$/);

  return href!.split('/').pop()!;
}

async function waitForClose(page: Page, scanId: string): Promise<void> {
  await page.goto(`/scans/${scanId}`);
  await expect(page.getByText(/Completado|Fallido|Cancelado/).first()).toBeVisible({
    timeout: 240_000,
  });
}

async function saveFormCredential(page: Page): Promise<void> {
  await page.goto('/settings');

  await page.getByLabel(/^Etiqueta/).fill('Área privada del fixture');
  await page.getByLabel(/^Tipo de autenticación/).selectOption('form');

  await page.getByLabel(/^Ruta del formulario de acceso/).fill('/login');
  await page.getByLabel(/^Campo del usuario/).fill('email');
  await page.getByLabel(/^Campo de la contraseña/).fill('password');

  await page.getByLabel(/^Usuario/).fill(FIXTURE_USER);
  await page.getByLabel(/^Contraseña/).fill(FIXTURE_PASSWORD);
  await page.getByLabel(/^Texto que confirma la sesión/).fill(SUCCESS_MARKER);

  await page.getByRole('button', { name: 'Guardar credencial' }).click({ timeout: 60_000 });
  await expect(page.getByText('Credencial guardada')).toBeVisible({ timeout: 60_000 });
}

/**
 * Compiles every route the demo touches, before the clock starts.
 *
 * ## Why a warm-up is part of the harness and not of the demo
 *
 * The demo runs against `next dev`, and it has to: `DEMO_MODE` is refused in
 * production by `lib/env.ts`, so there is no production build to fall back on.
 * `next dev` compiles a route the first time it is requested, and measured first
 * visits in this repository cost 5–28 s (`/settings` 27.9 s, `/settings/billing`
 * 22.1 s). A step that only opened a page therefore reported a timeout while the
 * server was still compiling, and a worker progress post could exceed its own
 * timeout for the same reason.
 *
 * Paying that cost once, before step 1, is what a presenter does too: rehearse
 * once, then record. Every measured number in `PRUEBA_SPRINT_2.md` is therefore
 * a warm number, and the manual says so.
 *
 * ## Why it signs in
 *
 * `(app)` routes redirect an anonymous visitor from the middleware, and a
 * redirect never renders — and never compiles — the page behind it. The warm-up
 * needs a real session, so it uses the same sign-in the demo uses.
 *
 * ## Why its own context
 *
 * It runs before the test's page exists, so it cannot leak into the recorded
 * video, and it reads only: nothing here changes what the demo will show.
 */
async function warmUp(browser: Browser): Promise<void> {
  const started = Date.now();
  const context = await browser.newContext({
    baseURL: BASE_URL,
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
  });
  const page = await context.newPage();

  try {
    await signIn(page, DEMO_PRO);

    /**
     * The all-zero identifiers are deliberate: a route is compiled by its
     * pattern, so a 404 proves the page module loaded. Using a real id would
     * couple the warm-up to data that the next reset is about to replace.
     */
    for (const path of [
      '/dashboard',
      '/scanner',
      '/schedules',
      '/reports',
      '/reports/domains/00000000-0000-0000-0000-000000000000',
      '/settings',
      '/settings/billing',
      '/scans/00000000-0000-0000-0000-000000000000',
      '/demo/checkout/00000000-0000-0000-0000-000000000000',
      '/login',
    ]) {
      await page.goto(path, { timeout: 180_000 });
    }
  } finally {
    await context.close();
  }

  console.log(`[demo] calentamiento: ${((Date.now() - started) / 1_000).toFixed(1)} s`);
}

test.describe('Sprint 2 — demo de ocho pasos', () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(900_000);

    resetDemoState();
    await warmUp(browser);
  });

  test.afterAll(async ({ request }) => {
    // Leave the fixture and the demo data as the other specs expect them.
    await setSlow(request, 0);
    await setSqli(request, false);
  });

  test('el recorrido completo del Sprint 2', async ({ page, request }) => {
    test.setTimeout(1_500_000);

    // The mailbox is not part of the database reset, so it is cleared here.
    await request.delete(`${MAILPIT_BASE}/api/v1/messages`);

    // ── 1. El panel ─────────────────────────────────────────────────────────
    await step(1, 'Panel: el riesgo de un vistazo', async () => {
      await signIn(page, DEMO_PRO);

      await expect(page.getByRole('heading', { name: 'Panel', level: 1 })).toBeVisible();
      await expect(page.getByText('Riesgo actual')).toBeVisible();

      await shot(page, '01-panel');
    });

    // ── 2. Cancelar un escaneo sin perder lo hallado (HU-06) ────────────────
    await step(2, 'Escaneo cancelado con resultados parciales (HU-06)', async () => {
      await setSlow(request, 1_200);

      const scanId = await submitScan(page);
      await page.goto(`/scans/${scanId}`);

      const cancel = page.getByRole('button', { name: 'Cancelar escaneo' });
      await expect(cancel).toBeVisible({ timeout: 90_000 });

      // Wait for at least one finished check: cancelling with zero findings
      // would not show that anything was preserved.
      await expect
        .poll(
          async () => {
            const response = await page.request.get(`/api/scans/${scanId}/events`, {
              timeout: 60_000,
            });
            const body = (await response.json()) as { events: Array<{ type: string }> };
            return body.events.some((event) => event.type === 'check.completed');
          },
          { timeout: 120_000 },
        )
        .toBe(true);

      await cancel.click();
      await expect(page.getByText('Cancelado').first()).toBeVisible({ timeout: 20_000 });

      // The worker publishes `scan.cancelled` before the terminal callback that
      // stores the partial findings, so the first reload can race it.
      await expect(async () => {
        await page.reload();
        await expect(page.getByText('Resultados parciales').first()).toBeVisible({
          timeout: 2_000,
        });
      }).toPass({ timeout: 60_000 });

      const allFindings = page.getByRole('link', { name: /^Todos \(\d+\)$/ });
      await expect(allFindings).toBeVisible({ timeout: 20_000 });

      await shot(page, '02-cancelacion-parcial');

      await setSlow(request, 0);

      const mail = await waitForMail(request, 'Escaneo cancelado', 90_000);
      expect(mail, 'the cancellation must be communicated by email').toBeDefined();

      await page.goto(MAILPIT_BASE);
      await shot(page, '03-correo-cancelacion');
    });

    // ── 3. Programación automática y alerta (HU-07) ─────────────────────────
    await step(3, 'Programación automática y alerta de hallazgo nuevo (HU-07)', async () => {
      // Baseline without SQL injection: the next scan must find nothing new.
      await setSqli(request, false);
      const quietScan = await submitScan(page);
      await waitForClose(page, quietScan);

      await page.goto('/schedules');
      await expect(page.locator('select option', { hasText: HOST }).first()).toHaveCount(1);

      /**
       * The form reloads the page on success (`window.location.reload()`), so the
       * navigation is awaited together with the click.
       *
       * The timeouts are explicit because the default `actionTimeout` (20 s) is
       * tuned for a click on an already-rendered page, not for a server action
       * plus a full reload on a dev server that may be recompiling. In a measured
       * run the action alone took 12 s and the reload 8.5 s, which missed the
       * default by half a second and reported a timeout for a step that worked.
       */
      const reloaded = page.waitForEvent('load', { timeout: 120_000 });
      await page.getByRole('button', { name: 'Crear programación' }).click({ timeout: 60_000 });
      await reloaded;

      await expect(page.getByText(/Próxima ejecución/).first()).toContainText(
        /\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/,
        { timeout: 20_000 },
      );

      await shot(page, '04-programacion');

      // The vulnerability appears, then the real runner fires the schedule.
      await setSqli(request, true);

      const output = runDemoScript('run-schedule-now.mjs', ['--domain', HOST]);
      const scheduled = output.match(/scheduled scan\s+([0-9a-f-]{36})/);
      expect(scheduled, `expected a scheduled scan id in:\n${output}`).not.toBeNull();

      scheduledScanId = scheduled![1];

      await waitForClose(page, scheduledScanId);
      await shot(page, '05-escaneo-programado');

      const alert = await waitForMail(request, 'Hallazgo crítico', 120_000);
      expect(alert, 'a new critical finding must alert the account').toBeDefined();

      await page.goto(MAILPIT_BASE);
      await shot(page, '06-alerta-correo');
    });

    // ── 4. Informe ejecutivo en PDF (HU-09) ─────────────────────────────────
    await step(4, 'Informe ejecutivo descargable (HU-09)', async () => {
      await page.goto('/reports');
      await shot(page, '07-informes');

      await page.goto(`/scans/${scheduledScanId}`);

      await expect(page.getByRole('link', { name: 'Exportar PDF (Ejecutivo)' })).toBeVisible({
        timeout: 30_000,
      });

      mkdirSync(DEMO_DIR, { recursive: true });

      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 120_000 }),
        page.getByRole('link', { name: 'Exportar PDF (Ejecutivo)' }).click(),
      ]);

      const target = join(DEMO_DIR, 'sprint2-informe-ejecutivo.pdf');
      await download.saveAs(target);

      await shot(page, '08-informe-ejecutivo');
    });

    // ── 5. Historial comparativo (HU-10) ────────────────────────────────────
    await step(5, 'Historial comparativo entre escaneos (HU-10)', async () => {
      await page.goto('/reports');

      const historyLink = page.locator('a[href^="/reports/domains/"]').first();
      await expect(historyLink).toBeVisible({ timeout: 30_000 });
      await historyLink.click();

      await expect(page.getByRole('heading', { name: 'Historial comparativo' })).toBeVisible();
      await expect(page.getByText(/No hay una nota compuesta/)).toBeVisible();

      await shot(page, '09-historial-comparativo', true);
    });

    // ── 6. Entrar con Google (proveedor simulado) (HU-02a) ──────────────────
    await step(6, 'Acceso con Google simulado (HU-02a)', async () => {
      await signOut(page);
      await page.goto('/login');

      await page.getByRole('button', { name: 'Continuar con Google' }).click({ timeout: 60_000 });
      await page.waitForURL(/127\.0\.0\.1:8100\/oauth\//, { timeout: 90_000 });

      // The banner is asserted so the recording can never be mistaken for a real
      // Google consent screen.
      await expect(page.getByText('PROVEEDOR DE IDENTIDAD SIMULADO')).toBeVisible();
      await shot(page, '10-proveedor-simulado');

      await page.locator('input[name="identity"][value="nueva-verificada"]').check();
      await page.getByRole('button', { name: 'Autorizar y volver a VulDetected' }).click({ timeout: 60_000 });

      await expect(page).toHaveURL(/\/dashboard/, { timeout: 90_000 });
      await shot(page, '11-sesion-social');

      await signOut(page);
    });

    // ── 7. Suscripción simulada (HU-02b) ────────────────────────────────────
    await step(7, 'Suscripción con pago simulado (HU-02b)', async () => {
      await signIn(page, DEMO_FREE);
      await page.goto('/settings/billing');

      await expect(page.getByText('Modo demostración: no se realiza ningún cobro')).toBeVisible();
      await shot(page, '12-facturacion-demo');

      /**
       * The checkout screen is asserted instead of `waitForURL`: the heading is
       * what the audience sees, and registering the wait after the click races
       * the server action's redirect on a slow dev server.
       */
      await page.getByRole('button', { name: 'Cambiar a Pro' }).click({ timeout: 60_000 });

      await expect(page.getByRole('heading', { name: 'Pasarela de pago simulada' })).toBeVisible({
        timeout: 90_000,
      });
      expect(page.url()).toMatch(/\/demo\/checkout\//);
      await shot(page, '13-checkout-simulado');

      await page.locator(`input[name="card"][value="${APPROVED_CARD}"]`).check({ timeout: 60_000 });
      await page.getByRole('button', { name: 'Pagar', exact: true }).click({ timeout: 60_000 });

      await expect(
        page.getByText('Aplicado: el estado de la suscripción cambió.'),
      ).toBeVisible({ timeout: 120_000 });

      await page.goto('/settings/billing');
      await expect(
        page.locator('div:has(> dt:text-is("Plan")) > dd').first(),
        'the approved payment must activate the plan through the webhook',
      ).toHaveText('Pro');

      await shot(page, '14-plan-activado');

      await signOut(page);
    });

    // ── 8. Escanear detrás de un login (HU-04) ──────────────────────────────
    await step(8, 'Escaneo autenticado detrás del login (HU-04)', async () => {
      await signIn(page, DEMO_PRO);
      await saveFormCredential(page);
      await shot(page, '15-credencial-guardada');

      const scanId = await submitScan(page);
      await waitForClose(page, scanId);

      await page.goto(`/scans/${scanId}`);
      await expect(page.getByText('Escaneo autenticado')).toBeVisible({ timeout: 30_000 });

      /**
       * The export is fetched through `page.request`, which inherits
       * `actionTimeout` (20 s) — a value tuned for a click on an already-rendered
       * page. This handler reads the scan and its findings and serialises them,
       * and on a dev server that is still settling it has taken longer than 20 s.
       * The timeout is explicit so a slow answer is not reported as a broken
       * export.
       */
      const response = await page.request.get(`/api/scans/${scanId}/export?format=json`, {
        timeout: 120_000,
      });
      expect(response.ok()).toBe(true);
      const body = (await response.json()) as { findings: Array<{ endpoint: string }> };
      const privateFindings = body.findings.filter((finding) =>
        finding.endpoint.includes('/private'),
      );

      expect(
        privateFindings.length,
        'the authenticated pass must report findings on the page behind the login',
      ).toBeGreaterThan(0);

      await shot(page, '16-escaneo-autenticado');
    });
  });
});
