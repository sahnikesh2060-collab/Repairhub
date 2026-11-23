import { z } from 'zod';
import { ROLES, SOCKET_EVENTS } from '../config/constants.js';
import { isBookingParticipant } from '../services/booking.service.js';
import { updateLocation } from '../services/technician.service.js';
import { logger } from '../utils/logger.js';
import { lat, lng, objectId } from '../validators/common.schemas.js';

const bookingPayload = z.object({ bookingId: objectId });
const locationPayload = z.object({ bookingId: objectId.optional(), lng, lat });

const bookingRoomOf = (bookingId) => `booking:${bookingId}`;

function reply(ack, body) {
  if (typeof ack === 'function') ack(body);
}

/** Wraps a handler: validates the payload, catches errors and always answers the ack. */
function handler(socket, schema, fn) {
  return async (payload, ack) => {
    const parsed = schema ? schema.safeParse(payload ?? {}) : { success: true, data: payload };
    if (!parsed.success) {
      reply(ack, {
        ok: false,
        error: 'VALIDATION_ERROR',
        details: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      });
      return;
    }
    try {
      reply(ack, await fn(parsed.data));
    } catch (err) {
      logger.warn(`[socket] handler error for ${socket.id}: ${err.message}`);
      reply(ack, { ok: false, error: err.code ?? 'INTERNAL_ERROR', message: err.message });
    }
  };
}

/**
 * Client -> server events for one authenticated socket (socket.data.user is set by the
 * handshake middleware, which already joined user:<id>).
 */
export function registerBookingHandlers(socket) {
  const user = socket.data.user;

  // Kept for compatibility with the original spec; the handshake already joined the room.
  socket.on(
    SOCKET_EVENTS.JOIN_USER_ROOM,
    handler(socket, null, async () => ({ ok: true, room: `user:${user.id}` })),
  );

  socket.on(
    SOCKET_EVENTS.JOIN_BOOKING_ROOM,
    handler(socket, bookingPayload, async ({ bookingId }) => {
      if (!(await isBookingParticipant(bookingId, user))) {
        return { ok: false, error: 'NOT_FOUND', message: 'Booking not found' };
      }
      await socket.join(bookingRoomOf(bookingId));
      return { ok: true, room: bookingRoomOf(bookingId) };
    }),
  );

  socket.on(
    SOCKET_EVENTS.LEAVE_BOOKING_ROOM,
    handler(socket, bookingPayload, async ({ bookingId }) => {
      await socket.leave(bookingRoomOf(bookingId));
      return { ok: true };
    }),
  );

  socket.on(
    SOCKET_EVENTS.TECHNICIAN_LOCATION_UPDATE,
    handler(socket, locationPayload, async ({ lng: x, lat: y }) => {
      if (user.role !== ROLES.TECHNICIAN) {
        return { ok: false, error: 'FORBIDDEN', message: 'Only technicians share location' };
      }
      const result = await updateLocation(user.id, { lng: x, lat: y });
      return { ok: true, ...result };
    }),
  );

  socket.on(
    SOCKET_EVENTS.TYPING,
    handler(socket, bookingPayload, async ({ bookingId }) => {
      const room = bookingRoomOf(bookingId);
      if (!socket.rooms.has(room)) return { ok: false, error: 'NOT_IN_ROOM' };
      socket.to(room).emit(SOCKET_EVENTS.TYPING, {
        bookingId,
        userId: user.id,
        name: user.name,
        role: user.role,
      });
      return { ok: true };
    }),
  );
}
