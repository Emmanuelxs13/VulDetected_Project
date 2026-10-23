import { toNextJsHandler } from 'better-auth/next-js';

import { getAuth } from '@/lib/auth';
import { consumeRateLimit, getClientIp, RateLimitError } from '@/lib/rate-limit';

/**
 * Better Auth's catch-all endpoint with IP rate limiting (task 4.3).
 */
export const dynamic = 'force-dynamic';

const handlers = toNextJsHandler((request) => getAuth().handler(request));

async function withRateLimit(request: Request, handler: (req: Request) => Promise<Response>) {
  try {
    const ip = getClientIp(request);
    await consumeRateLimit({ key: `ip:${ip}:auth`, limit: 30, windowSec: 900 });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
        status: 429,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ error: 'Service unavailable' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    });
  }
  return handler(request);
}

export const GET = (request: Request) => withRateLimit(request, (req) => handlers.GET(req));
export const POST = (request: Request) => withRateLimit(request, (req) => handlers.POST(req));
