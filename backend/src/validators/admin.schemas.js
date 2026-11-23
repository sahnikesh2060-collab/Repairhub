import { z } from 'zod';
import { BOOKING_STATUS_VALUES, ROLE_VALUES } from '../config/constants.js';
import { categoryKey, objectId } from './common.schemas.js';

const page = z.coerce.number().int().min(1).default(1);
const limit = z.coerce.number().int().min(1).max(100).default(20);
const optionalQ = z.string().trim().min(1).max(100).optional();
const boolQuery = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();

export const idParams = z.object({ params: z.object({ id: objectId }) });

export const listUsersSchema = z.object({
  query: z.object({ role: z.enum(ROLE_VALUES).optional(), q: optionalQ, page, limit }),
});

export const setActiveSchema = idParams.extend({
  body: z.object({ isActive: z.boolean({ required_error: 'isActive is required' }) }),
});

export const listTechniciansSchema = z.object({
  query: z.object({
    verified: boolQuery,
    online: boolQuery,
    category: categoryKey.optional(),
    q: optionalQ,
    page,
    limit,
  }),
});

export const verifyTechnicianSchema = z.object({
  params: z.object({ userId: objectId }),
  body: z.object({ isVerified: z.boolean({ required_error: 'isVerified is required' }) }),
});

export const listBookingsSchema = z.object({
  query: z
    .object({
      status: z.enum(BOOKING_STATUS_VALUES).optional(),
      category: categoryKey.optional(),
      q: optionalQ,
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
      page,
      limit,
    })
    .refine((v) => !v.from || !v.to || v.to >= v.from, {
      message: '"to" must be after "from"',
      path: ['to'],
    }),
});

const categoryFields = {
  key: categoryKey,
  name: z.string().trim().min(2).max(60),
  icon: z
    .string()
    .trim()
    .regex(/^[A-Z][A-Za-z0-9]*$/, 'icon must be a lucide-react icon name (PascalCase)'),
  description: z.string().trim().max(300),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(1000),
};

export const createCategorySchema = z.object({
  body: z.object({
    key: categoryFields.key,
    name: categoryFields.name,
    icon: categoryFields.icon.default('Wrench'),
    description: categoryFields.description.default(''),
    isActive: categoryFields.isActive.default(true),
    sortOrder: categoryFields.sortOrder.default(0),
  }),
});

export const updateCategorySchema = idParams.extend({
  body: z
    .object({
      name: categoryFields.name.optional(),
      icon: categoryFields.icon.optional(),
      description: categoryFields.description.optional(),
      isActive: categoryFields.isActive.optional(),
      sortOrder: categoryFields.sortOrder.optional(),
    })
    .strict('The category key cannot be changed')
    .refine((b) => Object.keys(b).length > 0, { message: 'Provide at least one field' }),
});
