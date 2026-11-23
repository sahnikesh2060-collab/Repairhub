import { ERROR_CODES } from '../config/constants.js';

/**
 * An error that maps directly onto the error envelope:
 * { success: false, error: { code, message, details? } } with HTTP `status`.
 */
export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    if (details !== undefined) this.details = details;
  }

  static badRequest(message = 'Bad request', details, code = 'BAD_REQUEST') {
    return new ApiError(400, code, message, details);
  }

  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, ERROR_CODES.UNAUTHORIZED, message);
  }

  static forbidden(message = 'You do not have permission to do this') {
    return new ApiError(403, ERROR_CODES.FORBIDDEN, message);
  }

  static notFound(message = 'Resource not found') {
    return new ApiError(404, ERROR_CODES.NOT_FOUND, message);
  }

  static conflict(message, code = ERROR_CODES.DUPLICATE, details) {
    return new ApiError(409, code, message, details);
  }

  static unprocessable(message, code = ERROR_CODES.VALIDATION_ERROR, details) {
    return new ApiError(422, code, message, details);
  }
}

export default ApiError;
