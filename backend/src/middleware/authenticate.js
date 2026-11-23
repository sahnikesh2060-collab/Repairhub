import { User } from '../models/User.js';
import { verifyAccessToken } from '../services/token.service.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/** Extracts the token from an "Authorization: Bearer <token>" header, or null. */
export function getBearerToken(req) {
  const header = req.get('authorization');
  if (!header) return null;
  const [scheme, token] = header.trim().split(/\s+/);
  if (!/^Bearer$/i.test(scheme) || !token) return null;
  return token;
}

/**
 * Requires a valid access token. Loads the user (must exist and be active) and sets
 * req.user = { id, role, name }. Role comes from the database, not the token, so role
 * changes and deactivations take effect immediately.
 */
export const authenticate = asyncHandler(async (req, _res, next) => {
  const token = getBearerToken(req);
  if (!token) throw ApiError.unauthorized('Authentication required');

  const payload = verifyAccessToken(token);
  const user = await User.findById(payload.sub).select('name role isActive').lean();
  if (!user || !user.isActive) throw ApiError.unauthorized('Account not found or disabled');

  req.user = { id: String(user._id), role: user.role, name: user.name };
  next();
});

export default authenticate;
