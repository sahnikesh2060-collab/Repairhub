/**
 * Sends the success envelope: { success: true, data, meta? }  (DECISIONS #12)
 */
export function sendSuccess(res, data = null, { status = 200, meta } = {}) {
  const body = { success: true, data };
  if (meta !== undefined) body.meta = meta;
  return res.status(status).json(body);
}

/**
 * Sends the error envelope: { success: false, error: { code, message, details? } }
 */
export function sendError(res, status, code, message, details) {
  const error = { code, message };
  if (details !== undefined) error.details = details;
  return res.status(status).json({ success: false, error });
}
