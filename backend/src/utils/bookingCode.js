import { Counter } from '../models/Counter.js';
import { BOOKING_CODE_PREFIX, BOOKING_CODE_START } from '../config/constants.js';

const MAX_ATTEMPTS = 3;

/**
 * Returns the next booking code for the UTC year of `date`, e.g. REP-2026-1001.
 * One atomic findOneAndUpdate ($inc + upsert) per call, so parallel callers never collide.
 * @param {Date} [date]
 */
export async function generateBookingCode(date = new Date()) {
  const year = date.getUTCFullYear();
  const counterId = `booking-${year}`;

  for (let attempt = 1; ; attempt += 1) {
    try {
      const counter = await Counter.findOneAndUpdate(
        { _id: counterId },
        { $inc: { seq: 1 } },
        { new: true, upsert: true, setDefaultsOnInsert: false },
      ).lean();
      return `${BOOKING_CODE_PREFIX}-${year}-${BOOKING_CODE_START + counter.seq}`;
    } catch (err) {
      // Two first-ever upserts for a year can race on _id; the loser simply retries.
      if (err?.code === 11000 && attempt < MAX_ATTEMPTS) continue;
      throw err;
    }
  }
}

export default generateBookingCode;
