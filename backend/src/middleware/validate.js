/**
 * Validates { body, params, query } against a Zod object schema and replaces them with the
 * parsed (trimmed, coerced, defaulted) values. Parts the schema does not declare are left as-is.
 * Failures go to the error handler, which answers 422 VALIDATION_ERROR with per-field details.
 *
 * @param {import('zod').ZodTypeAny} schema e.g. z.object({ body: z.object({...}) })
 */
export const validate = (schema) => (req, _res, next) => {
  const result = schema.safeParse({ body: req.body, params: req.params, query: req.query });
  if (!result.success) return next(result.error);

  const { body, params, query } = result.data;
  if (body !== undefined) req.body = body;
  if (params !== undefined) req.params = params;
  if (query !== undefined) {
    // req.query is a getter in some Express versions; redefine it instead of assigning.
    Object.defineProperty(req, 'query', {
      value: query,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  }
  return next();
};

export default validate;
