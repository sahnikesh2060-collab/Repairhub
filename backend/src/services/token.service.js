import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import {
  JWT_AUDIENCE_ACCESS,
  JWT_AUDIENCE_REFRESH,
  JWT_ISSUER,
  MAX_REFRESH_TOKENS_PER_USER,
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_PATH,
} from '../config/constants.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';

const UNIT_MS = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

/** Parses "15m", "7d", "30s"... into milliseconds. */
export function parseDurationMs(value) {
  const match = /^(\d+)(ms|s|m|h|d)$/.exec(String(value).trim());
  if (!match) throw new Error(`Invalid duration: ${value}`);
  return Number(match[1]) * UNIT_MS[match[2]];
}

const REFRESH_TTL_MS = parseDurationMs(env.JWT_REFRESH_EXPIRES);

/** SHA-256 hex digest; only this is stored for refresh tokens (DECISIONS #9). */
export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

const userIdOf = (user) => String(user._id ?? user.id);

export function signAccessToken(user) {
  return jwt.sign({ role: user.role }, env.JWT_ACCESS_SECRET, {
    subject: userIdOf(user),
    expiresIn: env.JWT_ACCESS_EXPIRES,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE_ACCESS,
    algorithm: 'HS256',
  });
}

/** Verifies an access token; throws a jsonwebtoken error (-> 401) when invalid or expired. */
export function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE_ACCESS,
    algorithms: ['HS256'],
  });
}

export function signRefreshToken(user) {
  return jwt.sign({}, env.JWT_REFRESH_SECRET, {
    subject: userIdOf(user),
    expiresIn: env.JWT_REFRESH_EXPIRES,
    // A random id makes every token unique, even two issued in the same second.
    jwtid: crypto.randomUUID(),
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE_REFRESH,
    algorithm: 'HS256',
  });
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, env.JWT_REFRESH_SECRET, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE_REFRESH,
    algorithms: ['HS256'],
  });
}

/**
 * Issues a new access + refresh pair and stores the refresh hash on the user.
 * Expired entries are dropped and at most MAX_REFRESH_TOKENS_PER_USER are kept (oldest pruned).
 * @returns {Promise<{ accessToken: string, refreshToken: string }>}
 */
export async function issueTokenPair(user, { userAgent = '' } = {}) {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  const now = new Date();

  await User.updateOne(
    { _id: user._id },
    { $pull: { refreshTokens: { expiresAt: { $lte: now } } } },
  );
  await User.updateOne(
    { _id: user._id },
    {
      $push: {
        refreshTokens: {
          $each: [
            {
              tokenHash: hashToken(refreshToken),
              expiresAt: new Date(now.getTime() + REFRESH_TTL_MS),
              userAgent: String(userAgent).slice(0, 300),
              createdAt: now,
            },
          ],
          $sort: { createdAt: 1 },
          $slice: -MAX_REFRESH_TOKENS_PER_USER,
        },
      },
    },
  );

  return { accessToken, refreshToken };
}

/**
 * Rotates a refresh token: the presented token's hash is removed atomically and a new pair
 * is issued. A correctly signed token whose hash is no longer stored has already been used
 * (or revoked), so ALL of the user's refresh tokens are revoked (reuse detection).
 */
export async function rotateRefreshToken(rawToken, { userAgent = '' } = {}) {
  if (!rawToken) throw ApiError.unauthorized('Refresh token missing');

  let payload;
  try {
    payload = verifyRefreshToken(rawToken);
  } catch (_err) {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  const tokenHash = hashToken(rawToken);
  const user = await User.findOneAndUpdate(
    { _id: payload.sub, 'refreshTokens.tokenHash': tokenHash },
    { $pull: { refreshTokens: { tokenHash } } },
    { new: true },
  );

  if (!user) {
    await User.updateOne({ _id: payload.sub }, { $set: { refreshTokens: [] } });
    throw ApiError.unauthorized('Refresh token reuse detected; all sessions have been signed out');
  }
  if (!user.isActive) throw ApiError.unauthorized('Account disabled');

  const tokens = await issueTokenPair(user, { userAgent });
  return { user, ...tokens };
}

/** Removes one refresh token (logout). Unknown or malformed tokens are ignored. */
export async function revokeRefreshToken(rawToken) {
  if (!rawToken) return;
  const decoded = jwt.decode(rawToken);
  if (!decoded || typeof decoded.sub !== 'string' || !/^[a-f\d]{24}$/i.test(decoded.sub)) return;
  await User.updateOne(
    { _id: decoded.sub },
    { $pull: { refreshTokens: { tokenHash: hashToken(rawToken) } } },
  );
}

/** Revokes every refresh token of a user (sign out everywhere). */
export async function revokeAllRefreshTokens(userId) {
  await User.updateOne({ _id: userId }, { $set: { refreshTokens: [] } });
}

// ---- Cookie helpers (DECISIONS #9: httpOnly, SameSite=Lax, path /api/auth) ----

function baseCookieOptions() {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
  };
}

export function setRefreshCookie(res, refreshToken) {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, { ...baseCookieOptions(), maxAge: REFRESH_TTL_MS });
}

export function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE_NAME, baseCookieOptions());
}

export function readRefreshCookie(req) {
  return req.cookies?.[REFRESH_COOKIE_NAME] ?? null;
}
