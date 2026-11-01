import pino from 'pino';
import { config } from '../config.js';

export const logger = pino({
  level: config.isTest ? 'silent' : config.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.newPassword',
      '*.currentPassword',
      '*.refreshToken',
      '*.accessToken',
    ],
    censor: '[redacted]',
  },
  transport:
    !config.isProd && !config.isTest && process.stdout.isTTY
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } }
      : undefined,
});
