import mongoose from 'mongoose';
import { env } from '../config/env.js';
import {
  BOOKING_STATUS,
  BOOKING_STATUS_VALUES,
  CATEGORY_KEY_PATTERN,
  MAX_BOOKING_IMAGES,
  NOTIFIED_RESPONSE,
  NOTIFIED_RESPONSE_VALUES,
  ROLE_VALUES,
  SCHEDULE_RESPONSE_VALUES,
  SCHEDULE_STATUS,
  SCHEDULE_STATUS_VALUES,
  SYSTEM_ROLE,
  URGENCY,
  URGENCY_VALUES,
} from '../config/constants.js';
import { buildPointSchema } from '../utils/geo.js';

const { Schema } = mongoose;
const ACTOR_ROLES = [...ROLE_VALUES, SYSTEM_ROLE];

const proposalFields = {
  technicianId: { type: Schema.Types.ObjectId, ref: 'User' },
  scheduledDate: { type: Date, required: true },
  timeSlotLabel: { type: String, trim: true, maxlength: 60 },
  technicianNote: { type: String, trim: true, maxlength: 500 },
  estimatedFee: { type: Number, min: 0 },
  proposedAt: { type: Date, default: Date.now },
  round: { type: Number, min: 1, required: true },
};

const proposedScheduleSchema = new Schema(proposalFields, { _id: false });

const scheduleHistorySchema = new Schema(
  {
    ...proposalFields,
    response: { type: String, enum: SCHEDULE_RESPONSE_VALUES },
    responseNote: { type: String, trim: true, maxlength: 500 },
    respondedAt: { type: Date },
  },
  { _id: false },
);

const statusHistorySchema = new Schema(
  {
    status: { type: String, enum: BOOKING_STATUS_VALUES, required: true },
    note: { type: String, trim: true, maxlength: 500, default: '' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    role: { type: String, enum: ACTOR_ROLES, required: true },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false },
);

const notifiedTechnicianSchema = new Schema(
  {
    technicianId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    distanceKm: { type: Number, min: 0 },
    notifiedAt: { type: Date, default: Date.now },
    response: { type: String, enum: NOTIFIED_RESPONSE_VALUES, default: NOTIFIED_RESPONSE.PENDING },
  },
  { _id: false },
);

const preferredWindowSchema = new Schema(
  {
    from: { type: Date },
    to: {
      type: Date,
      validate: {
        validator(value) {
          return !value || !this.from || value >= this.from;
        },
        message: 'preferredCustomerWindow.to must be after preferredCustomerWindow.from',
      },
    },
    note: { type: String, trim: true, maxlength: 300 },
  },
  { _id: false },
);

const reviewSchema = new Schema(
  {
    rating: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String, trim: true, maxlength: 1000, default: '' },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const cancellationSchema = new Schema(
  {
    by: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    role: { type: String, enum: ACTOR_ROLES, required: true },
    reason: { type: String, trim: true, maxlength: 500, default: '' },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

// Plain numbers on purpose: this is a fast-changing display value, never queried by location.
const liveLocationSchema = new Schema(
  {
    lng: { type: Number, min: -180, max: 180, required: true },
    lat: { type: Number, min: -90, max: 90, required: true },
    etaMinutes: { type: Number, min: 0 },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const bookingSchema = new Schema(
  {
    bookingCode: { type: String, required: true, unique: true, trim: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // DECISIONS #3: references User; the profile is TechnicianProfile.findOne({ userId }).
    technicianId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    category: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      match: [CATEGORY_KEY_PATTERN, 'Invalid category key'],
    },
    title: { type: String, required: true, trim: true, minlength: 5, maxlength: 120 },
    description: { type: String, required: true, trim: true, minlength: 10, maxlength: 2000 },
    images: {
      type: [{ type: String, trim: true, maxlength: 500 }],
      default: [],
      validate: {
        validator: (value) => value.length <= MAX_BOOKING_IMAGES,
        message: `A booking can have at most ${MAX_BOOKING_IMAGES} images`,
      },
    },
    location: { type: buildPointSchema({ withAddress: true }), required: true },
    preferredCustomerWindow: { type: preferredWindowSchema, default: undefined },
    urgency: { type: String, enum: URGENCY_VALUES, default: URGENCY.NORMAL },
    proposedSchedule: { type: proposedScheduleSchema, default: null },
    scheduleHistory: { type: [scheduleHistorySchema], default: [] },
    scheduleStatus: { type: String, enum: SCHEDULE_STATUS_VALUES, default: SCHEDULE_STATUS.NONE },
    status: { type: String, enum: BOOKING_STATUS_VALUES, default: BOOKING_STATUS.REQUESTED },
    statusHistory: { type: [statusHistorySchema], default: [] },
    notifiedTechnicians: { type: [notifiedTechnicianSchema], default: [] },
    excludedTechnicians: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: [] },
    estimatedCost: { type: Number, min: 0 },
    finalCost: { type: Number, min: 0 },
    currency: {
      type: String,
      uppercase: true,
      trim: true,
      match: [/^[A-Z]{3}$/, 'Invalid currency code'],
      default: () => env.CURRENCY,
    },
    review: { type: reviewSchema, default: null },
    cancellation: { type: cancellationSchema, default: null },
    liveLocation: { type: liveLocationSchema, default: null },
    // Phase 2 additions (see PHASE_2_NOTES.md)
    lastBroadcastAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { versionKey: false }, toObject: { versionKey: false } },
);

bookingSchema.index({ location: '2dsphere' });
bookingSchema.index({ status: 1, category: 1 });
bookingSchema.index({ technicianId: 1, status: 1 });
bookingSchema.index({ customerId: 1, createdAt: -1 });

/**
 * The only sanctioned way to change a booking's status: sets `status` and appends a
 * statusHistory entry. Phase 2 wraps this in a state machine that checks transitions.
 * Does not save; the caller persists the booking.
 *
 * @param {import('mongoose').Document} booking
 * @param {string} status one of BOOKING_STATUS
 * @param {{ id?: string, _id?: unknown, role?: string } | null} actor null for system actions
 * @param {string} [note]
 */
bookingSchema.statics.pushStatus = function pushStatus(booking, status, actor = null, note = '') {
  if (!BOOKING_STATUS_VALUES.includes(status)) {
    throw new Error(`Unknown booking status: ${status}`);
  }
  const actorId = actor ? (actor.id ?? actor._id ?? null) : null;
  booking.status = status;
  booking.statusHistory.push({
    status,
    note,
    updatedBy: actorId,
    role: actor?.role ?? SYSTEM_ROLE,
    timestamp: new Date(),
  });
  return booking;
};

export const Booking = mongoose.models.Booking || mongoose.model('Booking', bookingSchema);
export default Booking;
