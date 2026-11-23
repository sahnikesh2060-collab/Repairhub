import mongoose from 'mongoose';
import { NOTIFICATION_TTL_SECONDS, NOTIFICATION_TYPES } from '../config/constants.js';

const { Schema } = mongoose;

const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    body: { type: String, trim: true, maxlength: 500, default: '' },
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', default: null },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date },
  },
  { timestamps: true, toJSON: { versionKey: false }, toObject: { versionKey: false } },
);

notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
// TTL: MongoDB removes notifications 90 days after creation.
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: NOTIFICATION_TTL_SECONDS });

export const Notification =
  mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
export default Notification;
