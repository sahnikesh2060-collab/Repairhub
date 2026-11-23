import {
  BOOKING_STATUS as S,
  BOOKING_STATUS_VALUES,
  ROLE_VALUES,
  ROLES,
} from '../config/constants.js';
import { Booking } from '../models/Booking.js';
import { TechnicianProfile } from '../models/TechnicianProfile.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { presentBookingDetail } from './bookingPresenter.js';
import { notify } from './notification.service.js';
import { revokeAllRefreshTokens } from './token.service.js';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pageMeta = (page, limit, total) => ({
  page,
  limit,
  total,
  totalPages: Math.ceil(total / limit),
});

/** Dashboard numbers. completionRate = completed / (completed + cancelled), 0 when none. */
export async function stats() {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - 6);

  const [usersByRole, pendingVerification, bookingsByStatus, perDay] = await Promise.all([
    User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
    TechnicianProfile.countDocuments({ isVerified: false }),
    Booking.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Booking.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const roles = Object.fromEntries(ROLE_VALUES.map((r) => [r, 0]));
  for (const row of usersByRole) roles[row._id] = row.count;
  const statuses = Object.fromEntries(BOOKING_STATUS_VALUES.map((s) => [s, 0]));
  for (const row of bookingsByStatus) statuses[row._id] = row.count;

  const counts = new Map(perDay.map((r) => [r._id, r.count]));
  const bookingsPerDay = [];
  for (let i = 0; i < 7; i += 1) {
    const day = new Date(since);
    day.setUTCDate(since.getUTCDate() + i);
    const key = day.toISOString().slice(0, 10);
    bookingsPerDay.push({ date: key, count: counts.get(key) ?? 0 });
  }

  const finished = statuses[S.COMPLETED] + statuses[S.CANCELLED];
  return {
    usersByRole: roles,
    totalUsers: Object.values(roles).reduce((a, b) => a + b, 0),
    techniciansPendingVerification: pendingVerification,
    bookingsByStatus: statuses,
    totalBookings: Object.values(statuses).reduce((a, b) => a + b, 0),
    bookingsPerDay,
    completionRate: finished ? Math.round((statuses[S.COMPLETED] / finished) * 10000) / 10000 : 0,
  };
}

export async function listUsers({ role, q, page, limit }) {
  const filter = {};
  if (role) filter.role = role;
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { phone: rx }];
  }
  const [items, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    User.countDocuments(filter),
  ]);
  return { items, meta: pageMeta(page, limit, total) };
}

/** Deactivating also signs the user out everywhere. Admins cannot deactivate themselves. */
export async function setUserActive(adminId, userId, { isActive }) {
  if (String(adminId) === String(userId) && !isActive) {
    throw ApiError.unprocessable('You cannot deactivate your own account');
  }
  const user = await User.findByIdAndUpdate(userId, { $set: { isActive } }, { new: true });
  if (!user) throw ApiError.notFound('User not found');
  if (!isActive) {
    await revokeAllRefreshTokens(user._id);
    if (user.role === ROLES.TECHNICIAN) {
      await TechnicianProfile.updateOne({ userId: user._id }, { $set: { isAvailable: false } });
    }
  }
  return user;
}

export async function listTechnicians({ verified, category, online, q, page, limit }) {
  const match = {};
  if (verified !== undefined) match.isVerified = verified;
  if (online !== undefined) match.isAvailable = online;
  if (category) match.categories = category;

  const userMatch = {};
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    userMatch.$or = [{ 'user.name': rx }, { 'user.email': rx }, { 'user.phone': rx }];
  }

  const [result] = await TechnicianProfile.aggregate([
    { $match: match },
    {
      $lookup: {
        from: User.collection.name,
        localField: 'userId',
        foreignField: '_id',
        as: 'user',
        pipeline: [
          { $project: { name: 1, email: 1, phone: 1, avatar: 1, isActive: 1, createdAt: 1 } },
        ],
      },
    },
    { $unwind: '$user' },
    { $match: userMatch },
    { $sort: { isVerified: 1, createdAt: -1 } },
    {
      $facet: {
        items: [{ $skip: (page - 1) * limit }, { $limit: limit }, { $project: { __v: 0 } }],
        total: [{ $count: 'count' }],
      },
    },
  ]);
  return { items: result.items, meta: pageMeta(page, limit, result.total[0]?.count ?? 0) };
}

export async function verifyTechnician(technicianUserId, { isVerified }) {
  const profile = await TechnicianProfile.findOne({ userId: technicianUserId });
  if (!profile) throw ApiError.notFound('Technician not found');
  if (isVerified && !profile.categories.length) {
    throw ApiError.unprocessable(
      'The technician must choose at least one category before verification',
    );
  }
  const changed = profile.isVerified !== isVerified;
  profile.isVerified = isVerified;
  if (!isVerified) profile.isAvailable = false;
  await profile.save();

  if (changed) {
    await notify(technicianUserId, {
      type: 'TECH_VERIFIED',
      title: isVerified ? 'Your account is verified' : 'Your verification was withdrawn',
      body: isVerified
        ? 'Go online to start receiving nearby repair requests.'
        : 'Contact support for details. You will not receive new requests.',
    });
  }
  return profile;
}

export async function listBookings({ status, category, q, from, to, page, limit }) {
  const filter = {};
  if (status) filter.status = status;
  if (category) filter.category = category;
  if (q) filter.bookingCode = new RegExp(escapeRegex(q), 'i');
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = from;
    if (to) filter.createdAt.$lte = to;
  }
  const [items, total] = await Promise.all([
    Booking.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('-statusHistory -scheduleHistory -notifiedTechnicians')
      .populate('customerId', 'name email phone')
      .populate('technicianId', 'name email phone')
      .lean(),
    Booking.countDocuments(filter),
  ]);
  return { items, meta: pageMeta(page, limit, total) };
}

export async function getBooking(bookingId, admin) {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw ApiError.notFound('Booking not found');
  const detail = await presentBookingDetail(booking, admin, 'admin');
  const populated = await Booking.findById(bookingId)
    .select('notifiedTechnicians')
    .populate('notifiedTechnicians.technicianId', 'name email phone')
    .lean();
  detail.notifiedTechnicians = populated.notifiedTechnicians;
  return detail;
}
