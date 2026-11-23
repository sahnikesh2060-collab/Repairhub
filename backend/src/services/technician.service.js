import {
  BOOKING_STATUS as S,
  ERROR_CODES,
  LOCATION_THROTTLE_MS,
  SOCKET_EVENTS,
} from '../config/constants.js';
import { Booking } from '../models/Booking.js';
import { TechnicianProfile } from '../models/TechnicianProfile.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { fromPoint, haversineKm, toPoint } from '../utils/geo.js';
import { bookingSummary, presentOpenRequest } from './bookingPresenter.js';
import { etaMinutes } from './booking.service.js';
import { activeCategoryKeys } from './category.service.js';
import { emitTo, toBooking } from './realtime.service.js';

async function loadProfile(userId) {
  const profile = await TechnicianProfile.findOne({ userId });
  if (!profile) throw ApiError.notFound('Technician profile not found');
  return profile;
}

function receivesJobsInfo(profile) {
  const receivesJobs = profile.isVerified && profile.isAvailable;
  let message;
  if (!profile.isAvailable) message = 'You are offline and will not receive new requests.';
  else if (!profile.isVerified) {
    message =
      'You are online, but admin verification is pending, so you will not receive jobs yet.';
  } else message = 'You are online and will receive nearby requests.';
  return { receivesJobs, message };
}

export async function getMyTechnicianAccount(userId) {
  const [profile, user] = await Promise.all([loadProfile(userId), User.findById(userId)]);
  return { profile, user, ...receivesJobsInfo(profile) };
}

export async function updateMyProfile(userId, body) {
  const valid = await activeCategoryKeys(body.categories);
  const unknown = body.categories.filter((k) => !valid.has(k));
  if (unknown.length) {
    throw ApiError.unprocessable(
      `Unknown or inactive categories: ${unknown.join(', ')}`,
      ERROR_CODES.INVALID_CATEGORY,
      [{ field: 'categories', in: 'body', message: `Unknown: ${unknown.join(', ')}` }],
    );
  }
  const profile = await loadProfile(userId);
  profile.set({
    categories: [...new Set(body.categories)],
    bio: body.bio,
    experienceYears: body.experienceYears,
    visitFee: body.visitFee,
    serviceRadiusKm: body.serviceRadiusKm,
  });
  await profile.save();
  return { profile, ...receivesJobsInfo(profile) };
}

export async function setAvailability(userId, { isAvailable }) {
  const profile = await loadProfile(userId);
  if (isAvailable) {
    if (!profile.currentLocation) {
      throw ApiError.unprocessable(
        'Share your location before going online',
        ERROR_CODES.LOCATION_REQUIRED,
        [{ field: 'currentLocation', message: 'PATCH /api/technicians/me/location first' }],
      );
    }
    if (!profile.categories?.length) {
      throw ApiError.unprocessable(
        'Choose at least one service category before going online',
        ERROR_CODES.CATEGORIES_REQUIRED,
        [{ field: 'categories', message: 'PUT /api/technicians/me/profile first' }],
      );
    }
  }
  profile.isAvailable = isAvailable;
  await profile.save();
  return { profile, ...receivesJobsInfo(profile) };
}

/**
 * Stores the technician's position. Writes closer together than 10 seconds are ignored.
 * While a booking is ON_THE_WAY its liveLocation is updated with a rough straight-line ETA
 * (25 km/h) and technician_location_updated is emitted to booking:<id>.
 * Shared by PATCH /technicians/me/location and the technician_location_update socket event.
 */
export async function updateLocation(userId, { lng, lat, addressText }) {
  const now = new Date();
  const point = toPoint({ lng, lat });
  const existing = await TechnicianProfile.findOne({ userId })
    .select('currentLocation lastLocationAt')
    .lean();
  if (!existing) throw ApiError.notFound('Technician profile not found');

  const address = addressText !== undefined ? addressText : existing.currentLocation?.addressText;
  const currentLocation = address ? { ...point, addressText: address } : point;

  // The throttle lives in the filter, so it also holds across several server instances.
  const profile = await TechnicianProfile.findOneAndUpdate(
    {
      userId,
      $or: [
        { lastLocationAt: { $exists: false } },
        { lastLocationAt: null },
        { lastLocationAt: { $lte: new Date(now.getTime() - LOCATION_THROTTLE_MS) } },
      ],
    },
    { $set: { currentLocation, lastLocationAt: now } },
    { new: true, runValidators: true },
  );

  if (!profile) {
    const waitMs = existing.lastLocationAt
      ? existing.lastLocationAt.getTime() + LOCATION_THROTTLE_MS - now.getTime()
      : 0;
    return {
      ignored: true,
      reason: 'Location updates are limited to one every 10 seconds',
      retryAfterMs: Math.max(0, waitMs),
    };
  }

  const activeJobs = await Booking.find({ technicianId: userId, status: S.ON_THE_WAY });
  const updatedBookings = [];
  for (const booking of activeJobs) {
    const km = haversineKm({ lng, lat }, fromPoint(booking.location));
    const liveLocation = { lng, lat, etaMinutes: etaMinutes(km), updatedAt: now };
    const updated = await Booking.findOneAndUpdate(
      { _id: booking._id, status: S.ON_THE_WAY },
      { $set: { liveLocation } },
      { new: true, timestamps: false },
    );
    if (!updated) continue;
    emitTo([toBooking(updated._id)], SOCKET_EVENTS.TECHNICIAN_LOCATION_UPDATED, {
      bookingId: String(updated._id),
      ...liveLocation,
      booking: await bookingSummary(updated),
    });
    updatedBookings.push({ bookingId: String(updated._id), etaMinutes: liveLocation.etaMinutes });
  }

  return {
    ignored: false,
    currentLocation: profile.currentLocation,
    lastLocationAt: profile.lastLocationAt,
    liveBookings: updatedBookings,
  };
}

/** Open requests inside my own radius and categories, nearest first. */
export async function nearbyRequests(userId, { limit = 50 } = {}) {
  const profile = await loadProfile(userId);
  if (!profile.currentLocation) {
    throw ApiError.unprocessable(
      'Share your location to see nearby requests',
      ERROR_CODES.LOCATION_REQUIRED,
    );
  }
  if (!profile.categories.length) return { items: [], meta: { count: 0 } };

  const rows = await Booking.aggregate([
    {
      $geoNear: {
        near: { type: 'Point', coordinates: profile.currentLocation.coordinates },
        key: 'location',
        distanceField: 'distanceM',
        spherical: true,
        maxDistance: profile.serviceRadiusKm * 1000,
        query: {
          status: S.SEARCHING_TECHNICIAN,
          technicianId: null,
          category: { $in: profile.categories },
          excludedTechnicians: { $ne: profile.userId },
          customerId: { $ne: profile.userId },
        },
      },
    },
    { $sort: { distanceM: 1 } },
    { $limit: limit },
  ]);

  const items = rows.map((b) => presentOpenRequest(b, Math.round(b.distanceM / 100) / 10));
  return { items, meta: { count: items.length, radiusKm: profile.serviceRadiusKm } };
}

function startOfUtcDay(date, offsetMinutes) {
  const local = new Date(date.getTime() + offsetMinutes * 60_000);
  local.setUTCHours(0, 0, 0, 0);
  return local;
}

/**
 * Earnings windows are computed in the caller's time zone, given as minutes east of UTC
 * (the browser sends -new Date().getTimezoneOffset(); Nepal is 345). Weeks start on Monday.
 */
export async function earnings(userId, { tzOffsetMinutes = 0 } = {}) {
  const now = new Date();
  const shift = tzOffsetMinutes * 60_000;
  const dayStartLocal = startOfUtcDay(now, tzOffsetMinutes);
  const weekStartLocal = new Date(dayStartLocal);
  weekStartLocal.setUTCDate(weekStartLocal.getUTCDate() - ((weekStartLocal.getUTCDay() + 6) % 7));
  const monthStartLocal = new Date(
    Date.UTC(dayStartLocal.getUTCFullYear(), dayStartLocal.getUTCMonth(), 1),
  );
  const toUtc = (d) => new Date(d.getTime() - shift);

  const bucket = (since) => [
    { $match: since ? { completedAt: { $gte: since } } : {} },
    { $group: { _id: null, total: { $sum: { $ifNull: ['$finalCost', 0] } }, count: { $sum: 1 } } },
  ];

  const profile = await loadProfile(userId);
  const [result] = await Booking.aggregate([
    { $match: { technicianId: profile.userId, status: S.COMPLETED } },
    {
      $facet: {
        today: bucket(toUtc(dayStartLocal)),
        week: bucket(toUtc(weekStartLocal)),
        month: bucket(toUtc(monthStartLocal)),
        allTime: bucket(null),
      },
    },
  ]);
  const pick = (rows) => ({ total: rows[0]?.total ?? 0, count: rows[0]?.count ?? 0 });

  const recent = await Booking.find({ technicianId: profile.userId, status: S.COMPLETED })
    .sort({ completedAt: -1 })
    .limit(10)
    .select('bookingCode category title finalCost currency completedAt review.rating')
    .lean();

  return {
    currency: recent[0]?.currency ?? undefined,
    today: pick(result.today),
    week: pick(result.week),
    month: pick(result.month),
    allTime: pick(result.allTime),
    ratingAvg: profile.ratingAvg,
    ratingCount: profile.ratingCount,
    recentJobs: recent,
  };
}

/** Public technician card with the last 5 reviews. Reviewers are shown by first name. */
export async function publicProfile(technicianUserId) {
  const [user, profile] = await Promise.all([
    User.findOne({ _id: technicianUserId, role: 'technician', isActive: true })
      .select('name avatar')
      .lean(),
    TechnicianProfile.findOne({ userId: technicianUserId }).lean(),
  ]);
  if (!user || !profile) throw ApiError.notFound('Technician not found');

  const reviewed = await Booking.find({ technicianId: user._id, review: { $ne: null } })
    .sort({ 'review.createdAt': -1 })
    .limit(5)
    .select('category review customerId')
    .populate('customerId', 'name')
    .lean();

  return {
    _id: String(user._id),
    name: user.name,
    avatar: user.avatar ?? null,
    categories: profile.categories,
    bio: profile.bio,
    experienceYears: profile.experienceYears,
    visitFee: profile.visitFee,
    ratingAvg: profile.ratingAvg,
    ratingCount: profile.ratingCount,
    completedJobs: profile.completedJobs,
    isVerified: profile.isVerified,
    reviews: reviewed.map((b) => ({
      rating: b.review.rating,
      comment: b.review.comment,
      createdAt: b.review.createdAt,
      category: b.category,
      customerName: (b.customerId?.name ?? 'Customer').split(' ')[0],
    })),
  };
}
