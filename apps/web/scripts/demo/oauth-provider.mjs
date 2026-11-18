#!/usr/bin/env node
/**
 * Simulated OAuth 2.0 identity provider for the Sprint 2 demo (HU-02a).
 *
 * ## Why this exists
 *
 * CA-30 to CA-32 describe signing in with Google. The repository has no Google
 * or GitHub credentials, and a verification manual that says "it would work with
 * credentials" is not evidence. This server implements the part of the contract
 * the application actually depends on — authorization code + PKCE (S256), a
 * token exchange, and a userinfo endpoint that states whether the provider
 * considers the address verified — so the whole flow can be exercised, measured
 * and recorded.
 *
 * ## What it deliberately is NOT
 *
 * It is not Google and it is not GitHub. It serves the same OAuth 2.0 shape, and
 * it returns the *resolved* profile a real provider is reduced to: an immutable
 * subject, an address, a display name, and an explicit `email_verified` flag.
 * The screen says so in the largest text on the page, because a demo that
 * quietly pretends to be Google is a demo that teaches the wrong thing.
 *
 * The decision layer — whether a session is issued, whether a local account may
 * be linked, whether a verification email is sent — lives in the application,
 * not here. This server only answers "who is this and what does the provider
 * claim about their address".
 *
 * ## Why the identities are a fixed list
 *
 * Every criterion needs a specific situation: a brand-new account, an existing
 * verified account, an existing account whose address was never verified, and a
 * provider that refuses to assert verification at all. A presenter choosing from
 * a list is deterministic; a presenter typing an address at a fake login form is
 * not, and the interesting cases are the ones nobody types.
 */
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

/** How long an authorization code and an access token stay usable. */
const CODE_TTL_MS = 60_000;
const TOKEN_TTL_MS = 60 * 60 * 1000;

/**
 * The identities the demo can sign in as.
 *
 * `expectation` is not read by the server. It is the reason each row exists, so
 * that a reader of this file can tell which criterion a row proves without
 * reading the manual.
 */
export const DEMO_IDENTITIES = {
  google: [
    {
      key: 'nueva-verificada',
      sub: 'google-ana-nueva',
      email: 'ana.nueva@demo.vuldetected.dev',
      emailVerified: true,
      name: 'Ana Nueva',
      label: 'Ana Nueva — cuenta nueva, correo verificado',
      expectation: 'CA-30: crea la cuenta, inicia sesión y no envía correo de verificación.',
    },
    {
      key: 'nueva-sin-verificar',
      sub: 'google-beto-sin-verificar',
      email: 'beto.sinverificar@demo.vuldetected.dev',
      emailVerified: false,
      name: 'Beto Sin Verificar',
      label: 'Beto Sin Verificar — cuenta nueva, el proveedor NO afirma el correo',
      expectation:
        'CA-30: crea la cuenta e inicia sesión, pero el correo queda sin verificar y se envía el enlace.',
    },
    {
      key: 'local-verificada',
      sub: 'google-demo-pro',
      email: 'demo.pro@vuldetected.local',
      emailVerified: true,
      name: 'Demo Pro',
      label: 'Demo Pro — ya existe en VulDetected y su correo está verificado',
      expectation: 'CA-31: vincula la cuenta de Google a la cuenta local existente y entra.',
    },
    {
      key: 'local-sin-verificar',
      sub: 'google-demo-sin-verificar',
      email: 'demo.sinverificar@vuldetected.local',
      emailVerified: true,
      name: 'Demo Sin Verificar',
      label: 'Demo Sin Verificar — existe en VulDetected pero nunca verificó su correo',
      expectation:
        'ADR 0016: NO vincula y NO crea sesión; la cuenta local no demostró control del buzón.',
    },
    {
      key: 'local-verificada-proveedor-duda',
      sub: 'google-demo-pro-unverified',
      email: 'demo.pro@vuldetected.local',
      emailVerified: false,
      name: 'Demo Pro',
      label: 'Demo Pro — pero el proveedor NO afirma que el correo esté verificado',
      expectation: 'ADR 0016: NO vincula y NO crea sesión; el proveedor no respalda el correo.',
    },
  ],
  github: [
    {
      key: 'nueva-verificada',
      sub: 'github-carla-nueva',
      email: 'carla.nueva@demo.vuldetected.dev',
      emailVerified: true,
      name: 'Carla Nueva',
      label: 'Carla Nueva — cuenta nueva, correo primario verificado',
      expectation: 'CA-30-GH: crea la cuenta e inicia sesión con GitHub.',
    },
    {
      key: 'local-verificada',
      sub: 'github-demo-pro',
      email: 'demo.pro@vuldetected.local',
      emailVerified: true,
      name: 'Demo Pro',
      label: 'Demo Pro — ya existe en VulDetected y su correo está verificado',
      expectation: 'CA-31-GH: vincula la cuenta de GitHub a la cuenta local existente.',
    },
    {
      key: 'local-sin-verificar',
      sub: 'github-demo-sin-verificar',
      email: 'demo.sinverificar@vuldetected.local',
      emailVerified: true,
      name: 'Demo Sin Verificar',
      label: 'Demo Sin Verificar — existe en VulDetected pero nunca verificó su correo',
      expectation: 'ADR 0016: NO vincula y NO crea sesión.',
    },
  ],
};

/**
 * The registered clients. Read from the environment so the application and this
 * server cannot drift: both read the same variables, and the server refuses to
 * start without them instead of falling back to a guess.
 */
export function readClients(env = process.env) {
  const required = (name) => {
    const value = env[name];
    if (!value) {
      throw new Error(
        `[oauth-provider] ${name} is required. Run the demo through \`pnpm dev:all\`, ` +
          'which loads apps/web/.env.local, or export the variable yourself.',
      );
    }
    return value;
  };

  return {
    google: {
      clientId: required('OAUTH_DEMO_GOOGLE_CLIENT_ID'),
      clientSecret: required('OAUTH_DEMO_GOOGLE_CLIENT_SECRET'),
    },
    github: {
      clientId: required('OAUTH_DEMO_GITHUB_CLIENT_ID'),
      clientSecret: required('OAUTH_DEMO_GITHUB_CLIENT_SECRET'),
    },
  };
}

/**
 * PKCE S256 verification (RFC 7636 §4.6).
 *
 * Implemented rather than skipped because "the demo provider accepts anything"
 * is exactly the kind of shortcut that hides a broken client: if the application
 * ever stopped sending a verifier, this server would keep saying yes.
 */
export function verifyPkce(codeChallenge, codeChallengeMethod, codeVerifier) {
  if (!codeChallenge) {
    // The client chose not to use PKCE. Allowed by the RFC for confidential
    // clients; recorded as "no challenge" rather than as a failure.
    return { ok: true, reason: 'no_challenge' };
  }
  if (codeChallengeMethod !== 'S256') {
    return { ok: false, reason: 'unsupported_challenge_method' };
  }
  if (!codeVerifier) {
    return { ok: false, reason: 'missing_verifier' };
  }
  const computed = createHash('sha256').update(codeVerifier).digest('base64url');
  const a = Buffer.from(computed);
  const b = Buffer.from(codeChallenge);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'verifier_mismatch' };
  }
  return { ok: true, reason: 'ok' };
}

/** Constant-time comparison for the client secret. */
function secretMatches(expected, received) {
  if (typeof received !== 'string') return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Reads a form-encoded or JSON request body. */
async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  const contentType = request.headers['content-type'] ?? '';

  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(raw || '{}');
    } catch {
      return {};
    }
  }

  return Object.fromEntries(new URLSearchParams(raw));
}

function sendJson(response, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
    ...extraHeaders,
  });
  response.end(payload);
}

/**
 * The identity chooser.
 *
 * Styled as a plain page on purpose: it must not be mistaken for the product.
 * The banner is the first thing on the page and the largest text in it.
 */
function renderChooser(provider, params) {
  const identities = DEMO_IDENTITIES[provider] ?? [];
  const hidden = ['client_id', 'redirect_uri', 'state', 'code_challenge', 'code_challenge_method', 'scope']
    .filter((name) => params.get(name))
    .map(
      (name) =>
        `<input type="hidden" name="${name}" value="${escapeHtml(params.get(name) ?? '')}">`,
    )
    .join('\n      ');

  const rows = identities
    .map(
      (identity) => `
      <label class="row">
        <input type="radio" name="identity" value="${escapeHtml(identity.key)}"${
          identity.key === 'local-verificada' ? ' checked' : ''
        }>
        <span>
          <strong>${escapeHtml(identity.label)}</strong>
          <code>${escapeHtml(identity.email)}</code>
          <em>${escapeHtml(identity.expectation)}</em>
        </span>
      </label>`,
    )
    .join('\n');

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Proveedor simulado — ${escapeHtml(provider)}</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; font: 15px/1.5 system-ui, sans-serif; background: #0b1220; color: #e6edf7; }
    main { max-width: 760px; margin: 0 auto; padding: 32px 20px 64px; }
    .banner { background: #3b2a00; border: 1px solid #a67c00; color: #ffe6a3; padding: 14px 16px; border-radius: 10px; margin-bottom: 24px; }
    .banner strong { display: block; font-size: 18px; letter-spacing: .02em; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    p.sub { color: #93a4bd; margin: 0 0 20px; }
    form { display: grid; gap: 10px; }
    .row { display: flex; gap: 12px; align-items: flex-start; background: #121c2e; border: 1px solid #1e2b41; border-radius: 10px; padding: 12px 14px; cursor: pointer; }
    .row:has(input:checked) { border-color: #3b82f6; background: #14213a; }
    .row span { display: grid; gap: 2px; }
    .row strong { font-size: 14px; }
    .row code { font-size: 12px; color: #9fb3d1; }
    .row em { font-size: 12px; color: #7f8fa6; font-style: normal; }
    button { margin-top: 18px; padding: 12px 18px; font-size: 15px; font-weight: 600; border: 0; border-radius: 10px; background: #2563eb; color: white; cursor: pointer; }
    footer { margin-top: 28px; font-size: 12px; color: #64748b; }
  </style>
</head>
<body>
  <main>
    <div class="banner">
      <strong>PROVEEDOR DE IDENTIDAD SIMULADO</strong>
      Esto no es Google ni GitHub. Es un servidor local que implementa el mismo
      flujo OAuth 2.0 (código de autorización + PKCE) para poder demostrar el
      inicio de sesión social sin credenciales reales.
    </div>
    <h1>Elige con qué identidad entrar</h1>
    <p class="sub">Proveedor: <strong>${escapeHtml(provider)}</strong>. Cada opción existe para probar un criterio distinto.</p>
    <form method="post" action="/oauth/${escapeHtml(provider)}/authorize">
      ${hidden}
      ${rows}
      <button type="submit">Autorizar y volver a VulDetected</button>
    </form>
    <footer>Servidor de demo · no usar fuera de DEMO_MODE</footer>
  </main>
</body>
</html>`;
}

/**
 * Builds the HTTP server without starting it, so a test can bind it to an
 * ephemeral port and exercise the real endpoints.
 */
export function createProviderServer({ clients, log = () => {} }) {
  /** code → grant */
  const codes = new Map();
  /** access token → grant */
  const tokens = new Map();

  const prune = () => {
    const now = Date.now();
    for (const [code, grant] of codes) if (grant.expiresAt < now) codes.delete(code);
    for (const [token, grant] of tokens) if (grant.expiresAt < now) tokens.delete(token);
  };

  return createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const path = url.pathname;

    if (path === '/health') {
      return sendJson(response, 200, { ok: true, provider: 'simulated' });
    }

    const route = /^\/oauth\/(google|github)\/(authorize|token|userinfo)$/.exec(path);
    if (!route) {
      return sendJson(response, 404, { error: 'not_found' });
    }

    const provider = route[1];
    const step = route[2];
    const client = clients[provider];

    if (step === 'authorize' && request.method === 'GET') {
      prune();
      const params = new URLSearchParams(url.searchParams);

      if (params.get('client_id') !== client.clientId) {
        return sendJson(response, 400, { error: 'invalid_client' });
      }
      if (params.get('response_type') !== 'code') {
        return sendJson(response, 400, { error: 'unsupported_response_type' });
      }
      if (!params.get('redirect_uri')) {
        return sendJson(response, 400, { error: 'invalid_request', hint: 'redirect_uri required' });
      }

      const html = renderChooser(provider, params);
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'content-length': Buffer.byteLength(html),
      });
      return response.end(html);
    }

    if (step === 'authorize' && request.method === 'POST') {
      prune();
      const body = await readBody(request);

      if (body.client_id !== client.clientId) {
        return sendJson(response, 400, { error: 'invalid_client' });
      }

      const identity = (DEMO_IDENTITIES[provider] ?? []).find((item) => item.key === body.identity);
      if (!identity) {
        return sendJson(response, 400, { error: 'invalid_identity' });
      }

      const redirectUri = body.redirect_uri;
      if (!redirectUri) {
        return sendJson(response, 400, { error: 'invalid_request', hint: 'redirect_uri required' });
      }

      const code = randomUUID();
      codes.set(code, {
        provider,
        identity,
        redirectUri,
        codeChallenge: body.code_challenge || null,
        codeChallengeMethod: body.code_challenge_method || null,
        scope: body.scope || '',
        expiresAt: Date.now() + CODE_TTL_MS,
      });

      const target = new URL(redirectUri);
      target.searchParams.set('code', code);
      if (body.state) target.searchParams.set('state', body.state);

      log(`issued a code for ${provider}/${identity.key} (${identity.email})`);
      response.writeHead(302, { location: target.toString(), 'cache-control': 'no-store' });
      return response.end();
    }

    if (step === 'token' && request.method === 'POST') {
      prune();
      const body = await readBody(request);

      if (body.client_id !== client.clientId || !secretMatches(client.clientSecret, body.client_secret)) {
        return sendJson(response, 401, { error: 'invalid_client' });
      }
      if (body.grant_type !== 'authorization_code') {
        return sendJson(response, 400, { error: 'unsupported_grant_type' });
      }

      const grant = codes.get(body.code);
      if (!grant || grant.provider !== provider) {
        return sendJson(response, 400, { error: 'invalid_grant' });
      }
      // Single use, even on failure: a code that was presented once is spent.
      codes.delete(body.code);

      if (grant.expiresAt < Date.now()) {
        return sendJson(response, 400, { error: 'invalid_grant', hint: 'expired' });
      }
      if (body.redirect_uri !== grant.redirectUri) {
        return sendJson(response, 400, { error: 'invalid_grant', hint: 'redirect_uri mismatch' });
      }

      const pkce = verifyPkce(grant.codeChallenge, grant.codeChallengeMethod, body.code_verifier);
      if (!pkce.ok) {
        log(`PKCE refused for ${provider}: ${pkce.reason}`);
        return sendJson(response, 400, { error: 'invalid_grant', hint: `pkce_${pkce.reason}` });
      }

      const accessToken = `demo-${provider}-${randomUUID()}`;
      tokens.set(accessToken, { ...grant, expiresAt: Date.now() + TOKEN_TTL_MS });

      return sendJson(response, 200, {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: Math.floor(TOKEN_TTL_MS / 1000),
        scope: grant.scope,
      });
    }

    if (step === 'userinfo' && request.method === 'GET') {
      prune();
      const header = request.headers.authorization ?? '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : '';
      const grant = tokens.get(token);
      if (!grant || grant.provider !== provider) {
        return sendJson(response, 401, { error: 'invalid_token' });
      }

      const { identity } = grant;
      return sendJson(response, 200, {
        id: identity.sub,
        sub: identity.sub,
        email: identity.email,
        email_verified: identity.emailVerified,
        name: identity.name,
        picture: null,
      });
    }

    return sendJson(response, 405, { error: 'method_not_allowed' });
  });
}

const isEntryPoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  const port = Number(process.env.OAUTH_DEMO_PORT ?? 8100);

  let clients;
  try {
    clients = readClients();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  if (process.env.DEMO_MODE !== 'true') {
    console.error(
      '[oauth-provider] refusing to start: this is a demo component and DEMO_MODE is not true.',
    );
    process.exit(1);
  }

  const server = createProviderServer({
    clients,
    log: (message) => console.log(`[oauth-provider] ${message}`),
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`[oauth-provider] simulated provider listening on http://127.0.0.1:${port}`);
    console.log('[oauth-provider] Google and GitHub identities are fixed demo rows, not accounts.');
  });

  const stop = () => server.close(() => process.exit(0));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
