import { bookingRoom, getIO, userRoom } from '../sockets/index.js';
import { logger } from '../utils/logger.js';

function ioOrNull() {
  try {
    return getIO();
  } catch (_err) {
    // Socket.io is not attached (seed script, unit tests without a server): emits are no-ops.
    return null;
  }
}

/**
 * Emits `event` once to every socket in any of `rooms` (Socket.io de-duplicates sockets that
 * are in several of the rooms). Returns false when Socket.io is not running.
 */
export function emitTo(rooms, event, payload) {
  const list = [...new Set(rooms.filter(Boolean).map(String))];
  if (list.length === 0) return false;
  const io = ioOrNull();
  if (!io) {
    logger.debug(`[realtime] skipped ${event} (Socket.io not initialised)`);
    return false;
  }
  io.to(list).emit(event, payload);
  return true;
}

export const toUser = (userId) => userRoom(String(userId));
export const toBooking = (bookingId) => bookingRoom(String(bookingId));

/** Removes every socket of `userId` from the booking room (after decline or release). */
export function removeUserFromBookingRoom(userId, bookingId) {
  const io = ioOrNull();
  if (!io) return;
  io.in(userRoom(String(userId))).socketsLeave(bookingRoom(String(bookingId)));
}
