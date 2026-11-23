/**
 * Wraps an async Express handler so rejected promises reach the error handler.
 * @param {(req, res, next) => Promise<unknown>} fn
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export default asyncHandler;
