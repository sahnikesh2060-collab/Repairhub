import { SOCKET_EVENTS } from '../config/constants.js';
import { Notification } from '../models/Notification.js';
import { ApiError } from '../utils/ApiError.js';
import { emitTo, toUser } from './realtime.service.js';

/**
 * Saves a Notification AND emits notification:new to user:<userId>.
 * Use this everywhere instead of raw emits for notifications.
 * @param {string} userId
 * @param {{ type: string, title: string, body?: string, bookingId?: string, summary?: object }} input
 *   `summary` is the booking summary to include in the socket payload, when known.
 */
export async function notify(userId, { type, title, body = '', bookingId = null, summary = null }) {
  const notification = await Notification.create({ userId, type, title, body, bookingId });
  emitTo([toUser(userId)], SOCKET_EVENTS.NOTIFICATION_NEW, {
    bookingId: bookingId ? String(bookingId) : null,
    booking: summary,
    notification: notification.toJSON(),
  });
  return notification;
}

/** notify() for several users; failures for one user do not stop the others. */
export async function notifyMany(userIds, input) {
  const results = await Promise.allSettled(userIds.map((id) => notify(id, input)));
  return results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
}

export async function listNotifications(userId, { unread = false, page = 1, limit = 20 }) {
  const filter = { userId, ...(unread ? { isRead: false } : {}) };
  const [items, total, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Notification.countDocuments(filter),
    Notification.countDocuments({ userId, isRead: false }),
  ]);
  return {
    items,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit), unreadCount },
  };
}

export async function markRead(userId, notificationId) {
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, userId },
    { $set: { isRead: true, readAt: new Date() } },
    { new: true },
  );
  if (!notification) throw ApiError.notFound('Notification not found');
  return notification;
}

export async function markAllRead(userId) {
  const result = await Notification.updateMany(
    { userId, isRead: false },
    { $set: { isRead: true, readAt: new Date() } },
  );
  return { updated: result.modifiedCount };
}
