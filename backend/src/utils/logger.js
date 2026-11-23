import { env } from '../config/env.js';
import { currentRequestId } from './requestContext.js';

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

// Tests only surface errors; development shows everything; production hides debug.
const threshold = env.isTest ? LEVELS.error : env.isDev ? LEVELS.debug : LEVELS.info;

function write(level, message, meta) {
  if (LEVELS[level] > threshold) return;
  const requestId = currentRequestId();
  const tag = requestId ? ` [req:${requestId}]` : '';
  const line = `[${new Date().toISOString()}] ${level.toUpperCase().padEnd(5)}${tag} ${message}`;
  const out = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  if (meta === undefined) out(line);
  else out(line, meta);
}

export const logger = Object.freeze({
  error: (message, meta) => write('error', message, meta),
  warn: (message, meta) => write('warn', message, meta),
  info: (message, meta) => write('info', message, meta),
  debug: (message, meta) => write('debug', message, meta),
});

export default logger;
