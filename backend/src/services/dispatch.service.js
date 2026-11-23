import { env } from '../config/env.js';
import { DISPATCH_LIMIT, NOTIFIED_RESPONSE, SOCKET_EVENTS } from '../config/constants.js';
import { Booking } from '../models/Booking.js';
import { Category } from '../models/Category.js';
import { TechnicianProfile } from '../models/TechnicianProfile.js';
import { User } from '../models/User.js';
import { areaOf, bookingSummary } from './bookingPresenter.js';
import { notify } from './notification.service.js';
import { emitTo, toUser } from './realtime.service.js';

const geoPoint = (location) => ({ type: 'Point', coordinates: location.coordinates });

/**
 * Verified, online technicians of the booking's category whose OWN service radius reaches the
 * booking (capped by MAX_DISPATCH_RADIUS_KM, DECISIONS #8), nearest first, at most 20.
 * Excluded technicians, inactive users and the booking's own customer are left out.
 * @returns {Promise<Array<{ userId, name, distanceKm, ratingAvg, visitFee }>>}
 */
export async function findEligibleTechnicians(booking) {
  const rows = await TechnicianProfile.aggregate([
    {
      $geoNear: {
        near: geoPoint(booking.location),
        key: 'currentLocation',
        distanceField: 'distanceM',
        spherical: true,
        maxDistance: env.MAX_DISPATCH_RADIUS_KM * 1000,
        query: {
          categories: booking.category,
          isAvailable: true,
          isVerified: true,
          userId: { $nin: booking.excludedTechnicians ?? [] },
        },
      },
    },
    { $match: { $expr: { $lte: ['$distanceM', { $multiply: ['$serviceRadiusKm', 1000] }] } } },
    {
      $lookup: {
        from: User.collection.name,
        localField: 'userId',
        foreignField: '_id',
        as: 'user',
        pipeline: [{ $project: { name: 1, isActive: 1 } }],
      },
    },
    { $unwind: '$user' },
    { $match: { 'user.isActive': true, userId: { $ne: booking.customerId } } },
    { $sort: { distanceM: 1 } },
    { $limit: DISPATCH_LIMIT },
    {
      $project: {
        _id: 0,
        userId: 1,
        name: '$user.name',
        distanceKm: { $round: [{ $divide: ['$distanceM', 1000] }, 1] },
        ratingAvg: 1,
        visitFee: 1,
      },
    },
  ]);
  return rows.map((r) => ({ ...r, userId: String(r.userId) }));
}

/**
 * Notifies eligible technicians that have not been notified for this booking yet:
 * adds notifiedTechnicians entries, saves a NEW_REQUEST Notification for each and emits
 * new_repair_request to user:<techId>. Only the area is shared, never the exact address
 * or the customer's phone. Zero matches is not an error.
 * @returns {Promise<{ matchedCount: number, notifiedCount: number }>}
 */
export async function broadcast(booking, { matches } = {}) {
  const eligible = matches ?? (await findEligibleTechnicians(booking));
  const already = new Set((booking.notifiedTechnicians ?? []).map((n) => String(n.technicianId)));
  const fresh = eligible.filter((t) => !already.has(t.userId));
  const now = new Date();

  await Booking.updateOne(
    { _id: booking._id },
    {
      $set: { lastBroadcastAt: now },
      ...(fresh.length
        ? {
            $push: {
              notifiedTechnicians: {
                $each: fresh.map((t) => ({
                  technicianId: t.userId,
                  distanceKm: t.distanceKm,
                  notifiedAt: now,
                  response: NOTIFIED_RESPONSE.PENDING,
                })),
              },
            },
          }
        : {}),
    },
    { timestamps: false },
  );

  if (fresh.length) {
    const [category, summary] = await Promise.all([
      Category.findOne({ key: booking.category }).select('name').lean(),
      bookingSummary(booking, { technician: null }),
    ]);
    const area = areaOf(booking.location?.addressText);
    const categoryName = category?.name ?? booking.category;

    await Promise.all(
      fresh.map(async (tech) => {
        emitTo([toUser(tech.userId)], SOCKET_EVENTS.NEW_REPAIR_REQUEST, {
          bookingId: String(booking._id),
          bookingCode: booking.bookingCode,
          category: booking.category,
          title: booking.title,
          area,
          distanceKm: tech.distanceKm,
          urgency: booking.urgency,
          imagesCount: booking.images?.length ?? 0,
          createdAt: booking.createdAt,
          booking: summary,
        });
        await notify(tech.userId, {
          type: 'NEW_REQUEST',
          title: `New ${categoryName} request ${tech.distanceKm} km away`,
          body: `${booking.title} · ${area}`,
          bookingId: booking._id,
          summary,
        });
      }),
    );
  }

  return { matchedCount: eligible.length, notifiedCount: fresh.length };
}
