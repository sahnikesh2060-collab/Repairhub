import { ApiError } from '../utils/ApiError.js';

/**
 * Allows the request only for the listed roles. Must run after `authenticate`.
 * @param {...string} roles
 */
export const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(ApiError.forbidden(`This action requires role: ${roles.join(' or ')}`));
    }
    return next();
  };

export default requireRole;
