import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

/**
 * The dispatch endpoint is the only way queued mail leaves the system, so its
 * one security property is worth a test: without the secret it does nothing.
 */

const SECRET = 'a-very-long-dispatch-secret';

const deliverDueMail = vi.fn(async () => ({
  claimed: 0,
  sent: 0,
  failed: 0,
  reclaimed: 0,
}));

vi.mock('@/lib/env', () => ({
  getEnv: () => ({ MAIL_DISPATCH_SECRET: SECRET }),
}));

vi.mock('@/lib/mail/outbox', () => ({
  deliverDueMail: () => deliverDueMail(),
}));

function request(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost:3000/api/mail/dispatch', { method: 'POST', headers });
}

beforeEach(() => {
  deliverDueMail.mockClear();
});

describe('POST /api/mail/dispatch', () => {
  it('refuses a request with no authorization header', async () => {
    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(deliverDueMail).not.toHaveBeenCalled();
  });

  it('refuses a wrong secret without running a delivery pass', async () => {
    const response = await POST(request({ authorization: 'Bearer nope' }));

    expect(response.status).toBe(401);
    expect(deliverDueMail).not.toHaveBeenCalled();
  });

  it('refuses the right secret sent without the Bearer scheme', async () => {
    const response = await POST(request({ authorization: SECRET }));

    expect(response.status).toBe(401);
    expect(deliverDueMail).not.toHaveBeenCalled();
  });

  it('runs one pass and reports what it did when the secret matches', async () => {
    const response = await POST(request({ authorization: `Bearer ${SECRET}` }));

    expect(response.status).toBe(200);
    expect(deliverDueMail).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      claimed: 0,
      sent: 0,
      failed: 0,
      reclaimed: 0,
    });
  });

  it('answers 500 instead of pretending a failed pass succeeded', async () => {
    deliverDueMail.mockRejectedValueOnce(new Error('database is down'));

    const response = await POST(request({ authorization: `Bearer ${SECRET}` }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ ok: false });
  });
});
