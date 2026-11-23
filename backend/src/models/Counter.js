import mongoose from 'mongoose';

/** Named atomic sequences, e.g. { _id: 'booking-2026', seq: 21 }. */
const counterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true, toJSON: { versionKey: false }, toObject: { versionKey: false } },
);

export const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);
export default Counter;
