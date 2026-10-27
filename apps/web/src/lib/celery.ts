import 'server-only';

import { randomUUID } from 'node:crypto';

import type { WorkerCredentialPayload } from './credentials/secret';
import { withRedis } from './redis';

export interface ScanJobKwargs {
  scan_id: string;
  domain_id: string;
  target: {
    scheme: 'http' | 'https';
    host: string;
    port: number;
    base_url: string;
  };
  checks: string[];
  callback_base_url: string;
  /**
   * Decrypted credential for authenticated scanning.
   *
   * Omitted entirely when the domain has none, so the worker's default of "no
   * auth headers" is reached by absence rather than by an empty object.
   */
  credentials?: WorkerCredentialPayload;
}

function buildCeleryMessage(kwargs: ScanJobKwargs) {
  const taskId = randomUUID();
  const body = Buffer.from(
    JSON.stringify([[], kwargs, { callbacks: null, errbacks: null, chain: null, chord: null }]),
  ).toString('base64');

  const message = {
    body,
    'content-encoding': 'utf-8',
    'content-type': 'application/json',
    headers: {
      lang: 'py',
      task: 'scanner.tasks.run_scan',
      id: taskId,
      root_id: taskId,
      parent_id: null,
      group: null,
      retries: 0,
      timelimit: [300, 300],
      shadow: null,
      argsrepr: '()',
      kwargsrepr: JSON.stringify(kwargs),
      origin: 'web@vuldetected',
      replaced_task_nesting: 0,
      ignore_result: true,
      stamped_headers: null,
      stamps: {},
    },
    properties: {
      correlation_id: taskId,
      reply_to: taskId,
      delivery_mode: 2,
      delivery_info: { exchange: '', routing_key: 'celery' },
      priority: 0,
      body_encoding: 'base64',
      delivery_tag: taskId,
    },
  };

  return { message, taskId };
}

export async function enqueueScanJob(kwargs: ScanJobKwargs): Promise<{ taskId: string }> {
  const { message, taskId } = buildCeleryMessage(kwargs);
  await withRedis(async (client) => {
    await client.lPush('celery', JSON.stringify(message));
  });
  return { taskId };
}
