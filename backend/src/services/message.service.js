import { ERROR_CODES, FINISHED_STATUSES, ROLES, SOCKET_EVENTS } from '../config/constants.js';
import { Message } from '../models/Message.js';
import { ApiError } from '../utils/ApiError.js';
import { idOf } from '../utils/ids.js';
import { bookingSummary } from './bookingPresenter.js';
import { loadBookingFor } from './booking.service.js';
import { notify } from './notification.service.js';
import { emitTo, toBooking } from './realtime.service.js';

/**
 * Chat is between the booking's customer and its CURRENT technician, available once a
 * technician is assigned. Messages of a previously declined technician stay hidden from the
 * new one: only messages by the two current participants are returned.
 */
async function loadChat(bookingId, user, { write }) {
  const { booking, relation } = await loadBookingFor(bookingId, user, {
    allow: write ? ['owner', 'assigned'] : ['owner', 'assigned', 'admin'],
  });
  if (!booking.technicianId && relation !== 'admin') {
    throw ApiError.conflict(
      'Chat opens once a technician is assigned to this booking',
      ERROR_CODES.CHAT_UNAVAILABLE,
    );
  }
  if (write && FINISHED_STATUSES.includes(booking.status)) {
    throw ApiError.conflict(
      'This booking is finished; the chat is read-only',
      ERROR_CODES.CHAT_UNAVAILABLE,
    );
  }
  return { booking, relation };
}

function participantFilter(booking, relation) {
  const filter = { bookingId: booking._id };
  if (relation !== 'admin') {
    filter.senderId = { $in: [booking.customerId, booking.technicianId] };
  }
  return filter;
}

/** Oldest first, paginated. Marks the returned messages as read by the caller. */
export async function listMessages(bookingId, user, { page, limit }) {
  const { booking, relation } = await loadChat(bookingId, user, { write: false });
  const filter = participantFilter(booking, relation);
  const [items, total] = await Promise.all([
    Message.find(filter)
      .sort({ createdAt: 1, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Message.countDocuments(filter),
  ]);

  if (relation !== 'admin' && items.length) {
    await Message.updateMany(
      { _id: { $in: items.map((m) => m._id) }, readBy: { $ne: user.id } },
      { $addToSet: { readBy: user.id } },
    );
  }

  return { items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function postMessage(bookingId, user, { text }) {
  const { booking } = await loadChat(bookingId, user, { write: true });
  const message = await Message.create({
    bookingId: booking._id,
    senderId: user.id,
    senderRole: user.role,
    text,
    readBy: [user.id],
  });

  const summary = await bookingSummary(booking);
  emitTo([toBooking(booking._id)], SOCKET_EVENTS.BOOKING_MESSAGE, {
    bookingId: String(booking._id),
    booking: summary,
    message: { ...message.toJSON(), senderName: user.name },
  });

  const recipient =
    user.role === ROLES.CUSTOMER ? idOf(booking.technicianId) : idOf(booking.customerId);
  await notify(recipient, {
    type: 'NEW_MESSAGE',
    title: `New message from ${user.name}`,
    body: text.length > 120 ? `${text.slice(0, 117)}...` : text,
    bookingId: booking._id,
    summary,
  });

  return message;
}
