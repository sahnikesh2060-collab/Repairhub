import { z } from 'zod';
import { categoryKey, lat, lng, objectId } from './common.schemas.js';

export const updateProfileSchema = z.object({
  body: z.object({
    categories: z.array(categoryKey).min(1, 'Choose at least one category').max(10),
    bio: z.string().trim().max(500).default(''),
    experienceYears: z.number().int().min(0).max(60),
    visitFee: z.number().int('Whole currency units only').min(0).max(1_000_000),
    serviceRadiusKm: z.number().min(1).max(50),
  }),
});

export const availabilitySchema = z.object({
  body: z.object({ isAvailable: z.boolean({ required_error: 'isAvailable is required' }) }),
});

export const locationSchema = z.object({
  body: z.object({ lng, lat, addressText: z.string().trim().max(300).optional() }),
});

export const earningsSchema = z.object({
  query: z.object({
    tzOffsetMinutes: z.coerce.number().int().min(-720).max(840).default(0),
  }),
});

export const publicProfileSchema = z.object({ params: z.object({ userId: objectId }) });
