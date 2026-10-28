import 'server-only';

import { pino, type Logger } from 'pino';

import { getEnv } from './env';

/**
 * Structured application log.
 *
 * ## WHY PINO AND NOT `console`
 *
 * `console.error('[mail] ...', error)` prints something a human can read and
 * nothing a machine can query. The moment this product runs in a container, the
 * only consumer of that line is a log aggregator: it needs `level`, `time`,
 * `component` and the error's own fields as JSON, not as a string that has to be
 * re-parsed with a regular expression. `pino` writes one JSON object per line,
 * which is the format the collector already understands.
 *
 * ## WHY THERE IS NO PRETTY TRANSPORT
 *
 * `pino-pretty` runs in a worker thread. Under a bundler and inside a container
 * that thread is a second failure mode in the one path — logging — that must not
 * fail. In development the JSON is readable enough; in production it is what the
 * platform expects (12-factor: logs are an event stream on stdout).
 *
 * ## WHY SECRETS ARE REDACTED, NOT FILTERED BY THE CALLER
 *
 * A redaction list at the logger is the only version that survives a new caller.
 * The paths below cover the shapes this codebase logs today (session objects,
 * mail errors carrying request config, audit metadata). Anything matching is
 * replaced with `[redacted]` before the line is serialized, so it never reaches
 * the sink.
 *
 * ## WHY THE LEVEL FALLS BACK INSTEAD OF THROWING
 *
 * `getEnv()` throws when the environment is invalid, and an invalid environment
 * is exactly the situation whose failure needs a log line. A logger that throws
 * while starting up turns a config error into a blank container log, so the level
 * resolution degrades to `info` instead.
 */

/**
 * Values that must never appear in a log line.
 *
 * `password`, `token`, `secret` and `authorization` are credentials. `cookie`
 * carries the session token. `email` is deliberately absent: it is personal data,
 * but it is also the only identifier support can act on when a delivery fails,
 * and the audit trail already stores it. Anything that logs an email address does
 * so on purpose.
 */
const REDACT_PATHS = [
  'password',
  '*.password',
  'newPassword',
  'currentPassword',
  'token',
  '*.token',
  'secret',
  '*.secret',
  'apiKey',
  '*.apiKey',
  'authorization',
  '*.authorization',
  'cookie',
  '*.cookie',
  'headers.authorization',
  'headers.cookie',
  'req.headers.authorization',
  'req.headers.cookie',
];

/** One writable line sink. `process.stdout` in production; a buffer in tests. */
export interface LogSink {
  write(chunk: string): void;
}

export interface LogOptions {
  level?: string;
  /** Destination override. Tests pass a capturing sink. */
  destination?: LogSink;
}

/**
 * Builds a logger. Exported so tests can assert the redaction contract against
 * the same options production uses, instead of against a copy that can drift.
 */
export function createLogger(options: LogOptions = {}): Logger {
  return pino(
    {
      level: options.level ?? 'info',
      // ISO timestamps: a collector can index them, an operator can read them.
      timestamp: pino.stdTimeFunctions.isoTime,
      // `pid` and `hostname` are noise in a container; the platform already knows
      // which pod wrote the line. `service` is what makes two services in one
      // cluster distinguishable in a shared index.
      base: { service: 'vuldetected-web' },
      redact: { paths: REDACT_PATHS, censor: '[redacted]' },
      formatters: {
        level: (label) => ({ level: label }),
      },
    },
    options.destination as never,
  );
}

let root: Logger | null = null;

/**
 * Level for a given environment. `null` means the environment could not be
 * validated, which yields the quiet default. Pure and exported for the test: the
 * interesting cases are "production without LOG_LEVEL" and "invalid env", and
 * neither should require booting the app.
 */
export function resolveLogLevel(env: { LOG_LEVEL?: string; NODE_ENV: string } | null): string {
  if (env === null) {
    return 'info';
  }
  // Development logs at `debug` so a local run shows the request-level detail;
  // production stays at `info` unless LOG_LEVEL says otherwise, because verbose
  // logs are a cost and an information-disclosure surface of their own.
  return env.LOG_LEVEL ?? (env.NODE_ENV === 'production' ? 'info' : 'debug');
}

function rootLogger(): Logger {
  if (root !== null) {
    return root;
  }

  let env: { LOG_LEVEL?: string; NODE_ENV: string } | null = null;
  try {
    env = getEnv();
  } catch {
    // Invalid environment: keep the default level so the failure itself can be
    // logged. See the header comment.
  }

  root = createLogger({ level: resolveLogLevel(env) });
  return root;
}

/**
 * Logger for one component. Use the component name a reader would grep for:
 * `mail`, `audit`, `rate-limit`, `scheduler`, `scans`.
 */
export function getLogger(component: string): Logger {
  return rootLogger().child({ component });
}

/** Tests only: forget the memoised root so the next call re-reads the level. */
export function resetLoggerForTesting(): void {
  root = null;
}
