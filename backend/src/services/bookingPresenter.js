import { CONTACT_REVEALED_STATUSES } from '../config/constants.js';
import { User } from '../models/User.js';
import { TechnicianProfile } from '../models/TechnicianProfile.js';
import { fromPoint, haversineKm } from '../utils/geo.js';
import { allowedActions, stageOf } from './bookingStateMachine.js';

/** Area-level address: the first comma-separated part ("Thamel, Kathmandu" -> "Thamel"). */
export function areaOf(addressText) {
  if (!addressText) return '';
  return String(addressText).split(',')[0].trim();
}

/** True once contact details (exact address, phone numbers) may be shared between parties. */
export function contactRevealed(booking) {
  return CONTACT_REVEALED_STATUSES.includes(booking.status);
}

const round1 = (n) => Math.round(n * 10) / 10;

export function distanceKmBetween(point, booking) {
  const a = fromPoint(point);
  const b = fromPoint(booking.location);
  return a && b ? round1(haversineKm(a, b)) : null;
}

const TECH_PROFILE_FIELDS = 'userId ratingAvg ratingCount experienceYears completedJobs visitFee';

function techSummaryFrom(user, profile, { withPhone = false } = {}) {
  if (!user) return null;
  const summary = {
    _id: String(user._id),
    name: user.name,
    avatar: user.avatar ?? null,
    ratingAvg: profile?.ratingAvg ?? 0,
    ratingCount: profile?.ratingCount ?? 0,
    experienceYears: profile?.experienceYears ?? 0,
    completedJobs: profile?.completedJobs ?? 0,
    visitFee: profile?.visitFee ?? 0,
  };
  if (withPhone) summary.phone = user.phone ?? null;
  return summary;
}

/** Name, avatar and profile stats of a technician (by user id), or null. */
export async function technicianSummary(technicianId, { withPhone = false } = {}) {
  if (!technicianId) return null;
  const [user, profile] = await Promise.all([
    User.findById(technicianId).select('name avatar phone').lean(),
    TechnicianProfile.findOne({ userId: technicianId }).select(TECH_PROFILE_FIELDS).lean(),
  ]);
  return techSummaryFrom(user, profile, { withPhone });
}

/** Batch version for lists: Map<userId, { user, profile }>. */
export async function loadTechnicians(ids) {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  if (unique.length === 0) return new Map();
  const [users, profiles] = await Promise.all([
    User.find({ _id: { $in: unique } })
      .select('name avatar phone')
      .lean(),
    TechnicianProfile.find({ userId: { $in: unique } })
      .select(TECH_PROFILE_FIELDS)
      .lean(),
  ]);
  const byId = new Map(users.map((u) => [String(u._id), { user: u, profile: null }]));
  for (const p of profiles) {
    const entry = byId.get(String(p.userId));
    if (entry) entry.profile = p;
  }
  return byId;
}

export function technicianSummaryFromMap(map, technicianId, options) {
  const entry = technicianId ? map.get(String(technicianId)) : null;
  return entry ? techSummaryFrom(entry.user, entry.profile, options) : null;
}

/**
 * The compact booking summary carried by every socket payload:
 * { _id, bookingCode, status, scheduleStatus, proposedSchedule, technician, stage, updatedAt }.
 */
export async function bookingSummary(booking, { technician } = {}) {
  const tech =
    technician !== undefined ? technician : await technicianSummary(booking.technicianId);
  return {
    _id: String(booking._id),
    bookingCode: booking.bookingCode,
    status: booking.status,
    scheduleStatus: booking.scheduleStatus,
    proposedSchedule: booking.proposedSchedule ?? null,
    technician: tech,
    stage: stageOf(booking),
    updatedAt: booking.updatedAt,
  };
}

const plain = (booking) =>
  typeof booking.toJSON === 'function' ? booking.toJSON() : { ...booking };

/**
 * Shapes a booking for one viewer.
 * relation: 'owner' | 'assigned' | 'preview' | 'admin'.
 * - Before contact is revealed, technicians get only the area, no coordinates, no phone.
 * - Technicians never see the dispatch bookkeeping (notified / excluded lists).
 */
export async function presentBookingDetail(booking, viewer, relation, { profile = null } = {}) {
  const out = plain(booking);
  const revealed = contactRevealed(booking);
  out.area = areaOf(booking.location?.addressText);
  out.stage = stageOf(booking);
  out.allowedActions = allowedActions(booking, viewer);

  const showTechPhone = relation === 'admin' || (relation === 'owner' && revealed);
  out.technician = await technicianSummary(booking.technicianId, { withPhone: showTechPhone });

  if (relation === 'assigned' || relation === 'preview' || relation === 'admin') {
    const customer = await User.findById(booking.customerId).select('name avatar phone').lean();
    const showCustomerPhone = relation === 'admin' || (relation === 'assigned' && revealed);
    out.customer = customer
      ? {
          _id: String(customer._id),
          name: customer.name,
          avatar: customer.avatar ?? null,
          ...(showCustomerPhone ? { phone: customer.phone ?? null } : {}),
        }
      : null;
  }

  if (relation === 'assigned' || relation === 'preview') {
    if (profile?.currentLocation)
      out.distanceKm = distanceKmBetween(profile.currentLocation, booking);
    if (!revealed) out.location = null;
    delete out.notifiedTechnicians;
    delete out.excludedTechnicians;
  }

  if (relation === 'preview') {
    delete out.statusHistory;
    delete out.scheduleHistory;
    delete out.cancellation;
    delete out.liveLocation;
    delete out.review;
  }

  return out;
}

/** A list row for the customer's own bookings. */
export function presentCustomerRow(booking, techMap) {
  const revealed = contactRevealed(booking);
  return {
    _id: String(booking._id),
    bookingCode: booking.bookingCode,
    category: booking.category,
    title: booking.title,
    status: booking.status,
    scheduleStatus: booking.scheduleStatus,
    stage: stageOf(booking),
    urgency: booking.urgency,
    thumbnail: booking.images?.[0] ?? null,
    area: areaOf(booking.location?.addressText),
    addressText: booking.location?.addressText ?? '',
    proposedSchedule: booking.proposedSchedule ?? null,
    estimatedCost: booking.estimatedCost ?? null,
    finalCost: booking.finalCost ?? null,
    currency: booking.currency,
    hasReview: Boolean(booking.review),
    technician: technicianSummaryFromMap(techMap, booking.technicianId, { withPhone: revealed }),
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt,
  };
}

/** A list row for the technician's assigned bookings. */
export function presentTechnicianRow(booking, customer) {
  const revealed = contactRevealed(booking);
  return {
    _id: String(booking._id),
    bookingCode: booking.bookingCode,
    category: booking.category,
    title: booking.title,
    status: booking.status,
    scheduleStatus: booking.scheduleStatus,
    stage: stageOf(booking),
    urgency: booking.urgency,
    thumbnail: booking.images?.[0] ?? null,
    area: areaOf(booking.location?.addressText),
    ...(revealed ? { addressText: booking.location?.addressText ?? '' } : {}),
    proposedSchedule: booking.proposedSchedule ?? null,
    estimatedCost: booking.estimatedCost ?? null,
    finalCost: booking.finalCost ?? null,
    currency: booking.currency,
    customer: customer
      ? {
          _id: String(customer._id),
          name: customer.name,
          avatar: customer.avatar ?? null,
          ...(revealed ? { phone: customer.phone ?? null } : {}),
        }
      : null,
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt,
  };
}

/** Public preview of an open request (nearby-requests, new_repair_request). */
export function presentOpenRequest(booking, distanceKm) {
  return {
    _id: String(booking._id),
    bookingId: String(booking._id),
    bookingCode: booking.bookingCode,
    category: booking.category,
    title: booking.title,
    description: booking.description,
    area: areaOf(booking.location?.addressText),
    distanceKm,
    urgency: booking.urgency,
    imagesCount: booking.images?.length ?? 0,
    images: booking.images ?? [],
    preferredCustomerWindow: booking.preferredCustomerWindow ?? null,
    // Rounded to 2 decimals (about 1 km) so a map can show roughly where, never the exact spot.
    approxLocation: booking.location?.coordinates
      ? {
          lng: Math.round(booking.location.coordinates[0] * 100) / 100,
          lat: Math.round(booking.location.coordinates[1] * 100) / 100,
        }
      : null,
    createdAt: booking.createdAt,
  };
}
