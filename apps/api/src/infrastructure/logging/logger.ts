import pino, { type Logger } from 'pino';

const REDACT_PATHS = [
  'password',
  'authorization',
  'cookie',
  'refreshToken',
  'accessToken',
  'req.headers.authorization',
  'req.headers.cookie',
  'req.body.password',
  'req.body.refreshToken',
  'req.body.accessToken',
];

export function createLogger(level: string): Logger {
  return pino({
    level,
    redact: {
      paths: REDACT_PATHS,
      censor: '[REDACTED]',
    },
  });
}
