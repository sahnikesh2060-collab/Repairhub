/** True for null and undefined. */
export const isNil = (value) => value === null || value === undefined;

/** String id of an ObjectId, a populated document or a plain id; null when missing. */
export const idOf = (value) => (isNil(value) ? null : String(value._id ?? value));
