import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { ZodError } from 'zod';
import { env } from '../config/env.js';
import { ERROR_CODES } from '../config/constants.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';

const REQUEST_PARTS = new Set(['body', 'params', 'query']);

function zodDetails(error) {
  return error.issues.map((issue) => {
    const path = [...issue.path];
    const location = REQUEST_PARTS.has(path[0]) ? path.shift() : undefined;
    const detail = { field: path.join('.') || location || '(root)', message: issue.message };
    if (location) detail.in = location;
    return detail;
  });
}

function mongooseValidationDetails(error) {
  return Object.values(error.errors).map((e) => ({ field: e.path, message: e.message }));
}

/** Converts any thrown value into { status, code, message, details }. */
function normalize(err) {
  if (err instanceof ApiError) {
    return { status: err.status, code: err.code, message: err.message, details: err.details };
  }
  if (err instanceof ZodError) {
    return {
      status: 422,
      code: ERROR_CODES.VALIDATION_ERROR,
      message: 'Validation failed',
      details: zodDetails(err),
    };
  }
  if (err instanceof mongoose.Error.ValidationError) {
    return {
      status: 422,
      code: ERROR_CODES.VALIDATION_ERROR,
      message: 'Validation failed',
      details: mongooseValidationDetails(err),
    };
  }
  if (err instanceof mongoose.Error.CastError) {
    return {
      status: 400,
      code: ERROR_CODES.INVALID_ID,
      message: `Invalid value for ${err.path}`,
      details: [{ field: err.path, message: `Cannot cast "${err.value}" to ${err.kind}` }],
    };
  }
  if (err?.code === 11000) {
    const field = Object.keys(err.keyPattern ?? err.keyValue ?? {})[0] ?? 'field';
    return {
      status: 409,
      code: ERROR_CODES.DUPLICATE,
      message: `${field} already exists`,
      details: [{ field, message: `This ${field} is already in use` }],
    };
  }
  if (err instanceof jwt.JsonWebTokenError) {
    // Also covers TokenExpiredError and NotBeforeError (subclasses).
    return {
      status: 401,
      code: ERROR_CODES.UNAUTHORIZED,
      message: err instanceof jwt.TokenExpiredError ? 'Token expired' : 'Invalid token',
    };
  }
  if (err?.type === 'entity.parse.failed') {
    return {
      status: 400,
      code: ERROR_CODES.INVALID_JSON,
      message: 'Request body is not valid JSON',
    };
  }
  if (err?.type === 'entity.too.large') {
    return {
      status: 413,
      code: ERROR_CODES.PAYLOAD_TOO_LARGE,
      message: 'Request body is too large',
    };
  }
  return { status: 500, code: ERROR_CODES.INTERNAL_ERROR, message: 'Something went wrong' };
}

// Express recognises error middleware by its four parameters, so `_next` must stay.
export function errorHandler(err, req, res, _next) {
  const { status, code, message, details } = normalize(err);

  if (status >= 500) {
    logger.error(`[http] ${req.method} ${req.originalUrl} -> ${status}`, err);
  }

  if (res.headersSent) {
    res.end();
    return;
  }

  const error = { code, message };
  if (details !== undefined) error.details = details;
  if (env.isDev && err?.stack) error.stack = err.stack;

  res.status(status).json({ success: false, error });
}

export default errorHandler;
