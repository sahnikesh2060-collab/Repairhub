import mongoose from 'mongoose';
import { ROLE_VALUES } from '../config/constants.js';

const { Schema } = mongoose;

const messageSchema = new Schema(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    senderRole: { type: String, enum: ROLE_VALUES, required: true },
    text: { type: String, required: true, trim: true, minlength: 1, maxlength: 1000 },
    readBy: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: [] },
  },
  { timestamps: true, toJSON: { versionKey: false }, toObject: { versionKey: false } },
);

export const Message = mongoose.models.Message || mongoose.model('Message', messageSchema);
export default Message;
