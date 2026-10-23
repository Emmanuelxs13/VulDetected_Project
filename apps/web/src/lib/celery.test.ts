import { describe, expect, it, vi } from 'vitest';

import { enqueueScanJob } from './celery';
import * as redis from './redis';

describe('celery message encoding (golden fixture)', () => {
  it('encodes a standard Celery 5.x message with the expected shape', async () => {
    const push = vi.fn(async () => 'ok');
    const connect = vi.fn(async () => undefined);
    const client = {
      isReady: true,
      lPush: push,
      connect,
    } as unknown as import('redis').RedisClientType;

    const withRedisSpy = vi
      .spyOn(redis, 'withRedis')
      .mockImplementation(async (fn: any) => fn(client)); // eslint-disable-line @typescript-eslint/no-explicit-any

    const kwargs = {
      scan_id: 'a9d43f44-8d85-4db5-b6ea-0c7f3c10cc5c',
      domain_id: 'f64f8b68-7f2e-42aa-8a5c-083d0cdd0b83',
      target: {
        scheme: 'https' as const,
        host: 'example.com',
        port: 443,
        base_url: 'https://example.com',
      },
      checks: ['security_headers', 'tls', 'cookies', 'redirects'],
      callback_base_url: 'http://localhost:3000',
    };

    const result = await enqueueScanJob(kwargs);
    expect(result.taskId).toBeDefined();
    expect(withRedisSpy).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledTimes(1);
    expect(connect).not.toHaveBeenCalled();

    const [queueName, messageJson] = push.mock.calls[0] as unknown as [string, string];
    expect(queueName).toBe('celery');
    const message = JSON.parse(messageJson);

    expect(message['content-encoding']).toBe('utf-8');
    expect(message['content-type']).toBe('application/json');
    expect(message.headers.task).toBe('scanner.tasks.run_scan');
    expect(message.headers.lang).toBe('py');
    expect(message.headers.retries).toBe(0);
    expect(message.headers.timelimit).toEqual([300, 300]);
    expect(message.headers.ignore_result).toBe(true);
    expect(message.headers.argsrepr).toBe('()');
    expect(message.properties.delivery_mode).toBe(2);
    expect(message.properties.body_encoding).toBe('base64');

    const decodedBody = JSON.parse(Buffer.from(message.body, 'base64').toString('utf-8'));
    expect(decodedBody).toHaveLength(3);
    expect(decodedBody[0]).toEqual([]);
    expect(decodedBody[1]).toEqual(kwargs);
    expect(decodedBody[2]).toEqual({
      callbacks: null,
      errbacks: null,
      chain: null,
      chord: null,
    });

    withRedisSpy.mockRestore();
  });
});
