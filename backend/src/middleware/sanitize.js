/**
 * Removes keys that start with "$" or contain "." from req.body, req.query and req.params,
 * so client input can never become a MongoDB operator (NoSQL injection). Equivalent to
 * express-mongo-sanitize, written here because that package cannot reassign req.query.
 */
function strip(value, depth = 0) {
  if (depth > 20 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) value[i] = strip(value[i], depth + 1);
    return value;
  }
  if (value instanceof Date || Buffer.isBuffer(value)) return value;
  for (const key of Object.keys(value)) {
    if (key.startsWith('$') || key.includes('.')) {
      delete value[key];
    } else {
      value[key] = strip(value[key], depth + 1);
    }
  }
  return value;
}

export function sanitizeRequest(req, _res, next) {
  if (req.body) strip(req.body);
  if (req.query) strip(req.query);
  if (req.params) strip(req.params);
  next();
}

export default sanitizeRequest;
