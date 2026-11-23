import { z } from 'zod';
import { CATEGORY_KEY_PATTERN } from '../config/constants.js';

/** 24-hex MongoDB ObjectId. */
export const objectId = z
  .string({ required_error: 'Id is required' })
  .regex(/^[a-f\d]{24}$/i, 'Invalid id');

/** Accepts a number, or a numeric string (multipart forms send strings). Empty strings fail. */
const numeric = (label) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() !== '' ? Number(v) : v),
    z
      .number({
        required_error: `${label} is required`,
        invalid_type_error: `${label} must be a number`,
      })
      .finite(`${label} must be a finite number`),
  );

// DECISIONS #4: clients send named { lng, lat }, never a bare coordinate array.
export const lng = numeric('lng').pipe(
  z.number().min(-180, 'lng must be >= -180').max(180, 'lng must be <= 180'),
);
export const lat = numeric('lat').pipe(
  z.number().min(-90, 'lat must be >= -90').max(90, 'lat must be <= 90'),
);
export const lngLat = z.object({ lng, lat });

export const personName = z
  .string({ required_error: 'Name is required' })
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .max(80, 'Name must be at most 80 characters');

export const email = z
  .string({ required_error: 'Email is required' })
  .trim()
  .toLowerCase()
  .max(254)
  .email('Invalid email address');

export const password = z
  .string({ required_error: 'Password is required' })
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[A-Za-z]/, 'Password must contain at least one letter')
  .regex(/\d/, 'Password must contain at least one number');

/** Phone: digits with optional leading +; spaces, dashes and brackets are stripped. */
export const phone = z
  .string()
  .transform((v) => v.replace(/[\s\-()]/g, ''))
  .pipe(z.string().regex(/^\+?\d{7,15}$/, 'Phone must be 7-15 digits, optionally starting with +'));

/** Avatar: an http(s) URL or a path from our own uploads. */
export const avatarUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => /^https?:\/\/\S+$/i.test(v) || /^\/uploads\/[\w\-./]+$/.test(v), {
    message: 'Avatar must be an http(s) URL or an /uploads/ path',
  });

export const categoryKey = z
  .string()
  .trim()
  .toUpperCase()
  .regex(CATEGORY_KEY_PATTERN, 'Invalid category key');

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
