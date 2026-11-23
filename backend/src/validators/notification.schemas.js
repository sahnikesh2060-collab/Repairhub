import { z } from 'zod';
import { objectId } from './common.schemas.js';

export const listNotificationsSchema = z.object({
  query: z.object({
    unread: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .default('false'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

export const notificationIdSchema = z.object({ params: z.object({ id: objectId }) });
