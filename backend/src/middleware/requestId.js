import crypto from 'node:crypto';
import { requestContext } from '../utils/requestContext.js';

const SAFE_ID = /^[\w-]{8,64}$/;

/**
 * Gives every request an id (reusing a well-formed incoming X-Request-Id, e.g. from Nginx),
 * echoes it in the X-Request-Id response header and makes it available to the logger.
 */
export function requestId(req, res, next) {
  const incoming = req.get('x-request-id');
  const id = incoming && SAFE_ID.test(incoming) ? incoming : crypto.randomUUID();
  req.id = id;
  res.setHeader('X-Request-Id', id);
  requestContext.run({ requestId: id }, next);
}

export default requestId;
