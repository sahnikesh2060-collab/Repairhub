import { z } from 'zod';
import {
  MAX_BOOKING_PAGE_SIZE,
  SCHEDULE_MAX_LEAD_MS,
  SCHEDULE_MIN_LEAD_MS,
  SCHEDULE_RESPONSE_VALUES,
  URGENCY,
  URGENCY_VALUES,
} from '../config/constants.js';
import { categoryKey, lat, lng, objectId } from './common.schemas.js';

/** Multipart forms send '' for empty fields; treat that as "not provided". */
const blankToUndefined = (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const optionalText = (max) => z.preprocess(blankToUndefined, z.string().trim().max(max).optional());
const optionalDate = z.preprocess(
  blankToUndefined,
  z.coerce.date({ invalid_type_error: 'Must be an ISO 8601 date' }).optional(),
);
const money = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() !== '' ? Number(v) : blankToUndefined(v)),
  z
    .number({ invalid_type_error: 'Must be a number' })
    .int('Whole currency units only')
    .min(0)
    .max(10_000_000),
);

export const bookingIdParams = z.object({ params: z.object({ id: objectId }) });

export const createBookingSchema = z.object({
  body: z
    .object({
      category: categoryKey,
      title: z.string({ required_error: 'Title is required' }).trim().min(5).max(120),
      description: z.string({ required_error: 'Description is required' }).trim().min(10).max(2000),
      lng,
      lat,
      addressText: z.string({ required_error: 'Address is required' }).trim().min(3).max(300),
      preferredFrom: optionalDate,
      preferredTo: optionalDate,
      preferredNote: optionalText(300),
      urgency: z.preprocess(blankToUndefined, z.enum(URGENCY_VALUES).default(URGENCY.NORMAL)),
    })
    .refine((b) => !b.preferredFrom || !b.preferredTo || b.preferredTo >= b.preferredFrom, {
      message: 'preferredTo must be after preferredFrom',
      path: ['preferredTo'],
    }),
});

export const listBookingsSchema = z.object({
  query: z.object({
    status: z
      .enum(['active', 'past', 'all', 'awaiting', 'upcoming', 'ongoing', 'completed', 'cancelled'])
      .default('all'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(MAX_BOOKING_PAGE_SIZE).default(20),
  }),
});

const scheduleBody = z.object({
  scheduledDate: z.coerce
    .date({
      required_error: 'scheduledDate is required',
      invalid_type_error: 'Must be an ISO date',
    })
    .refine((d) => d.getTime() >= Date.now() + SCHEDULE_MIN_LEAD_MS, {
      message: 'scheduledDate must be at least 15 minutes from now',
    })
    .refine((d) => d.getTime() <= Date.now() + SCHEDULE_MAX_LEAD_MS, {
      message: 'scheduledDate must be within the next 14 days',
    }),
  timeSlotLabel: z.string({ required_error: 'timeSlotLabel is required' }).trim().min(1).max(60),
  technicianNote: optionalText(500),
  estimatedFee: money.optional(),
});

export const scheduleSchema = bookingIdParams.extend({ body: scheduleBody });

export const respondScheduleSchema = bookingIdParams.extend({
  body: z.object({
    action: z.enum(SCHEDULE_RESPONSE_VALUES),
    note: optionalText(500),
  }),
});

export const releaseSchema = bookingIdParams.extend({
  body: z.object({
    reason: z.string({ required_error: 'reason is required' }).trim().min(3).max(300),
  }),
});

export const updateStatusSchema = bookingIdParams.extend({
  body: z
    .object({
      status: z.enum(['ON_THE_WAY', 'IN_PROGRESS', 'COMPLETED']),
      note: optionalText(500),
      finalCost: money.optional(),
    })
    .refine((b) => b.status !== 'COMPLETED' || b.finalCost !== undefined, {
      message: 'finalCost is required to complete a booking',
      path: ['finalCost'],
    }),
});

export const cancelSchema = bookingIdParams.extend({
  body: z.object({
    reason: z.string({ required_error: 'reason is required' }).trim().min(5).max(300),
  }),
});

export const reviewSchema = bookingIdParams.extend({
  body: z.object({
    rating: z.number({ required_error: 'rating is required' }).int().min(1).max(5),
    comment: optionalText(1000),
  }),
});

export const listMessagesSchema = bookingIdParams.extend({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  }),
});

export const postMessageSchema = bookingIdParams.extend({
  body: z.object({
    text: z.string({ required_error: 'text is required' }).trim().min(1).max(1000),
  }),
});
