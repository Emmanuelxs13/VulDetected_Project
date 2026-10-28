import { describe, expect, it } from 'vitest';

import { createLogger, resolveLogLevel, type LogSink } from './logger';

/**
 * The log is an operational contract: one JSON object per line, a component on
 * every line, and no credential ever leaving the process. These tests pin that
 * contract because a `console.log` that "just works" is exactly how a token ends
 * up in a log aggregator.
 */

function capture(): LogSink & { lines: string[]; parsed(): Record<string, unknown>[] } {
  const lines: string[] = [];
  return {
    lines,
    write(chunk: string) {
      lines.push(chunk);
    },
    parsed() {
      return lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    },
  };
}

describe('createLogger', () => {
  it('writes one JSON object per line with the component attached', () => {
    const sink = capture();
    const log = createLogger({ destination: sink }).child({ component: 'mail' });

    log.info({ scanId: 'scan-1' }, 'queued');

    expect(sink.lines).toHaveLength(1);
    expect(sink.parsed()[0]).toMatchObject({
      level: 'info',
      component: 'mail',
      service: 'vuldetected-web',
      scanId: 'scan-1',
      msg: 'queued',
    });
    // ISO-8601, so a log index can order lines across pods.
    expect(sink.parsed()[0]?.time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('redacts credentials at any depth', () => {
    const sink = capture();
    const log = createLogger({ destination: sink });

    log.error(
      {
        password: 'hunter2',
        token: 'tok_123',
        nested: { authorization: 'Bearer abc', cookie: 'session=xyz' },
      },
      'failed',
    );

    const line = sink.lines.join('');
    expect(line).not.toContain('hunter2');
    expect(line).not.toContain('tok_123');
    expect(line).not.toContain('Bearer abc');
    expect(line).not.toContain('session=xyz');
    expect(sink.parsed()[0]?.password).toBe('[redacted]');
  });

  it('serializes an error with its type and stack', () => {
    const sink = capture();
    const log = createLogger({ destination: sink });

    log.error({ err: new TypeError('boom') }, 'could not queue the email');

    const err = sink.parsed()[0]?.err as Record<string, unknown>;
    expect(err.type).toBe('TypeError');
    expect(err.message).toBe('boom');
    expect(err.stack).toContain('TypeError: boom');
  });

  it('drops lines below the configured level', () => {
    const sink = capture();
    const log = createLogger({ level: 'warn', destination: sink });

    log.debug('ignored');
    log.info('ignored');
    log.warn('kept');

    expect(sink.parsed().map((line) => line.msg)).toEqual(['kept']);
  });
});

describe('resolveLogLevel', () => {
  it('is verbose in development and quiet in production', () => {
    expect(resolveLogLevel({ NODE_ENV: 'development' })).toBe('debug');
    expect(resolveLogLevel({ NODE_ENV: 'production' })).toBe('info');
  });

  it('lets LOG_LEVEL win in both environments', () => {
    expect(resolveLogLevel({ NODE_ENV: 'production', LOG_LEVEL: 'warn' })).toBe('warn');
    expect(resolveLogLevel({ NODE_ENV: 'development', LOG_LEVEL: 'error' })).toBe('error');
  });

  it('falls back to info when the environment is invalid', () => {
    // A boot with a broken .env still has to be able to say why it broke.
    expect(resolveLogLevel(null)).toBe('info');
  });
});
