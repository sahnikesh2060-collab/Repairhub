import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { ERROR_CODES } from '../config/constants.js';

const FIFTEEN_MINUTES = 15 * 60 * 1000;

function limiter(limit, message) {
  return rateLimit({
    windowMs: FIFTEEN_MINUTES,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // The test suite fires many auth requests from one IP; limits are exercised in staging.
    skip: () => env.isTest,
    handler: (_req, res) => {
      res.status(429).json({
        success: false,
        error: { code: ERROR_CODES.RATE_LIMITED, message },
      });
    },
  });
}

/** 20 requests / 15 min per IP, applied to login and register. */
export const authLimiter = limiter(20, 'Too many attempts. Please try again in 15 minutes.');

/** 300 requests / 15 min per IP, applied to everything under /api. */
export const generalLimiter = limiter(300, 'Too many requests. Please slow down.');

/** Per signed-in user (falls back to IP). Must run after `authenticate`. */
function userLimiter(windowMs, limit, message) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => (req.user?.id ? `user:${req.user.id}` : `ip:${req.ip}`),
    skip: () => env.isTest,
    handler: (_req, res) => {
      res.status(429).json({ success: false, error: { code: ERROR_CODES.RATE_LIMITED, message } });
    },
  });
}

/** 10 new bookings per hour per customer. */
export const bookingCreateLimiter = userLimiter(
  60 * 60 * 1000,
  10,
  'You have created many requests in the last hour. Please try again later.',
);

/** 30 chat messages per minute per user. */
export const messageLimiter = userLimiter(60 * 1000, 30, 'You are sending messages too quickly.');

/** 6 location updates per minute per technician (the service also ignores writes within 10 s). */
export const locationLimiter = userLimiter(
  60 * 1000,
  6,
  'Location updates are limited to 6 per minute.',
);
