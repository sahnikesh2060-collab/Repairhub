import { env } from '../config/env.js';
import {
  BOOKING_STATUS as S,
  ERROR_CODES,
  ETA_SPEED_KMH,
  FINISHED_STATUSES,
  NOTIFIED_RESPONSE,
  REBROADCAST_COOLDOWN_MS,
  ROLES,
  SCHEDULE_RESPONSE,
  SCHEDULE_STATUS,
  SOCKET_EVENTS,
} from '../config/constants.js';
import { Booking } from '../models/Booking.js';
import { Category } from '../models/Category.js';
import { TechnicianProfile } from '../models/TechnicianProfile.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { idOf, isNil } from '../utils/ids.js';
import { generateBookingCode } from '../utils/bookingCode.js';
import { fromPoint, haversineKm, toPoint } from '../utils/geo.js';
import {
  bookingSummary,
  loadTechnicians,
  presentBookingDetail,
  presentCustomerRow,
  presentTechnicianRow,
} from './bookingPresenter.js';
import { planTransition, statusEntry, SYSTEM_ACTOR, transition } from './bookingStateMachine.js';
import { broadcast, findEligibleTechnicians } from './dispatch.service.js';
import { notify } from './notification.service.js';
import { emitTo, removeUserFromBookingRoom, toBooking, toUser } from './realtime.service.js';

const actorOf = (user) => ({ id: user.id, role: user.role });
const includesId = (list, id) => (list ?? []).some((x) => idOf(x) === id);

const LIST_FILTERS = Object.freeze({
  active: { status: { $nin: FINISHED_STATUSES } },
  past: { status: { $in: FINISHED_STATUSES } },
  all: {},
});

// ---------------------------------------------------------------------------
// Access (DECISIONS #15: anyone without access gets 404)
// ---------------------------------------------------------------------------

function wasNotified(booking, techId) {
  return (booking.notifiedTechnicians ?? []).some((n) => idOf(n.technicianId) === techId);
}

/** True when the technician's own radius and categories cover the booking. */
export function profileCoversBooking(profile, booking) {
  if (!profile?.currentLocation || !profile.categories?.includes(booking.category)) return false;
  const a = fromPoint(profile.currentLocation);
  const b = fromPoint(booking.location);
  return Boolean(a && b) && haversineKm(a, b) <= profile.serviceRadiusKm;
}

function isOpenFor(booking, techId) {
  return (
    booking.status === S.SEARCHING_TECHNICIAN &&
    isNil(booking.technicianId) &&
    !includesId(booking.excludedTechnicians, techId) &&
    idOf(booking.customerId) !== techId
  );
}

/**
 * How `user` relates to `booking`: 'owner' | 'assigned' | 'preview' | 'admin' | null.
 * 'preview' is a technician looking at an open request they were notified about or that
 * falls inside their own radius and categories.
 */
export async function resolveRelation(booking, user, { profile } = {}) {
  if (user.role === ROLES.ADMIN) return 'admin';
  if (user.role === ROLES.CUSTOMER && idOf(booking.customerId) === user.id) return 'owner';
  if (user.role === ROLES.TECHNICIAN) {
    if (!isNil(booking.technicianId) && idOf(booking.technicianId) === user.id) return 'assigned';
    if (isOpenFor(booking, user.id)) {
      if (wasNotified(booking, user.id)) return 'preview';
      const p = profile ?? (await TechnicianProfile.findOne({ userId: user.id }).lean());
      if (profileCoversBooking(p, booking)) return 'preview';
    }
  }
  return null;
}

/** Loads a booking the user may access with one of `allow`, else 404. */
export async function loadBookingFor(bookingId, user, { allow, profile } = {}) {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw ApiError.notFound('Booking not found');
  const relation = await resolveRelation(booking, user, { profile });
  if (!relation || (allow && !allow.includes(relation))) {
    throw ApiError.notFound('Booking not found');
  }
  return { booking, relation };
}

/** Owner, assigned technician or admin (socket booking rooms and chat). */
export async function isBookingParticipant(bookingId, user) {
  const booking = await Booking.findById(bookingId).select('customerId technicianId').lean();
  if (!booking) return false;
  if (user.role === ROLES.ADMIN) return true;
  if (user.role === ROLES.CUSTOMER) return idOf(booking.customerId) === user.id;
  if (user.role === ROLES.TECHNICIAN) return idOf(booking.technicianId) === user.id;
  return false;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Optimistic write: applies `update` only if the booking still has the status and
 * updatedAt we loaded. Anything else changed it in between -> 409 BOOKING_CHANGED.
 */
async function commit(booking, update, { filter = {}, arrayFilters } = {}) {
  const updated = await Booking.findOneAndUpdate(
    { _id: booking._id, status: booking.status, updatedAt: booking.updatedAt, ...filter },
    update,
    { new: true, runValidators: true, ...(arrayFilters ? { arrayFilters } : {}) },
  );
  if (!updated) {
    throw ApiError.conflict(
      'This booking was just changed by someone else. Reload and try again.',
      ERROR_CODES.BOOKING_CHANGED,
    );
  }
  return updated;
}

function proposalFrom(techId, body, round) {
  return {
    technicianId: techId,
    scheduledDate: body.scheduledDate,
    timeSlotLabel: body.timeSlotLabel,
    technicianNote: body.technicianNote ?? '',
    estimatedFee: body.estimatedFee,
    proposedAt: new Date(),
    round,
  };
}

async function present(booking, user, relation, profile) {
  return presentBookingDetail(booking, user, relation, { profile });
}

// ---------------------------------------------------------------------------
// 1. Create
// ---------------------------------------------------------------------------

export async function createBooking(user, body, imagePaths = []) {
  const category = await Category.findOne({ key: body.category, isActive: true }).lean();
  if (!category) {
    throw ApiError.unprocessable('Unknown or inactive category', ERROR_CODES.INVALID_CATEGORY, [
      { field: 'category', in: 'body', message: `No active category "${body.category}"` },
    ]);
  }

  const actor = actorOf(user);
  const hasWindow = body.preferredFrom || body.preferredTo || body.preferredNote;
  const booking = new Booking({
    bookingCode: await generateBookingCode(),
    customerId: user.id,
    category: category.key,
    title: body.title,
    description: body.description,
    images: imagePaths,
    location: { ...toPoint({ lng: body.lng, lat: body.lat }), addressText: body.addressText },
    preferredCustomerWindow: hasWindow
      ? { from: body.preferredFrom, to: body.preferredTo, note: body.preferredNote }
      : undefined,
    urgency: body.urgency,
    currency: env.CURRENCY,
    status: S.REQUESTED,
    statusHistory: [statusEntry(S.REQUESTED, actor, 'Request created')],
  });
  await booking.save();

  const matches = await findEligibleTechnicians(booking);
  transition(booking, S.SEARCHING_TECHNICIAN, SYSTEM_ACTOR, {
    note: matches.length
      ? `${matches.length} nearby technician(s) notified`
      : 'No technician available nearby yet',
  });
  await booking.save();
  const { matchedCount } = await broadcast(booking, { matches });

  const fresh = await Booking.findById(booking._id);
  return { booking: await present(fresh, user, 'owner'), matchedCount };
}

// ---------------------------------------------------------------------------
// 2-4. Read
// ---------------------------------------------------------------------------

function pageMeta(page, limit, total) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}

export async function listCustomerBookings(user, { status, page, limit }) {
  const filter = { customerId: user.id, ...LIST_FILTERS[status] };
  const [rows, total] = await Promise.all([
    Booking.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Booking.countDocuments(filter),
  ]);
  const techMap = await loadTechnicians(rows.map((b) => b.technicianId));
  return {
    items: rows.map((b) => presentCustomerRow(b, techMap)),
    meta: pageMeta(page, limit, total),
  };
}

export async function listTechnicianBookings(user, { status, page, limit }) {
  const filter = { technicianId: user.id, ...LIST_FILTERS[status] };
  const [rows, total] = await Promise.all([
    Booking.find(filter)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Booking.countDocuments(filter),
  ]);
  const customers = await User.find({ _id: { $in: rows.map((b) => b.customerId) } })
    .select('name avatar phone')
    .lean();
  const byId = new Map(customers.map((c) => [String(c._id), c]));
  return {
    items: rows.map((b) => presentTechnicianRow(b, byId.get(String(b.customerId)))),
    meta: pageMeta(page, limit, total),
  };
}

export async function getBookingDetail(bookingId, user) {
  const profile =
    user.role === ROLES.TECHNICIAN
      ? await TechnicianProfile.findOne({ userId: user.id }).lean()
      : null;
  const { booking, relation } = await loadBookingFor(bookingId, user, { profile });
  return present(booking, user, relation, profile);
}

// ---------------------------------------------------------------------------
// 5. Accept and schedule (first accept wins, DECISIONS #7)
// ---------------------------------------------------------------------------

function assertEligible(profile, booking) {
  const fail = (message) => {
    throw new ApiError(403, ERROR_CODES.NOT_ELIGIBLE, message);
  };
  if (!profile) fail('Technician profile not found');
  if (!profile.isVerified) fail('Your account is awaiting admin verification');
  if (!profile.isAvailable) fail('Go online to accept jobs');
  if (!profile.categories.includes(booking.category)) {
    fail(`You do not offer the ${booking.category} category`);
  }
  if (!profile.currentLocation) fail('Share your location before accepting jobs');
  const km = haversineKm(fromPoint(profile.currentLocation), fromPoint(booking.location));
  if (km > profile.serviceRadiusKm) {
    fail(
      `This job is ${km.toFixed(1)} km away, outside your ${profile.serviceRadiusKm} km service radius`,
    );
  }
  return Math.round(km * 10) / 10;
}

export async function acceptAndSchedule(bookingId, user, body) {
  const techId = user.id;
  const booking = await Booking.findById(bookingId);
  const profile = await TechnicianProfile.findOne({ userId: techId }).lean();
  if (!booking) throw ApiError.notFound('Booking not found');

  // Only technicians who could legitimately know about the request may learn its state.
  const knowsAboutIt = wasNotified(booking, techId) || profileCoversBooking(profile, booking);
  if (
    !knowsAboutIt ||
    includesId(booking.excludedTechnicians, techId) ||
    idOf(booking.customerId) === techId
  ) {
    throw ApiError.notFound('Booking not found');
  }
  if (booking.status !== S.SEARCHING_TECHNICIAN || !isNil(booking.technicianId)) {
    throw ApiError.conflict(
      'Another technician has already taken this job',
      ERROR_CODES.ALREADY_TAKEN,
    );
  }

  const distanceKm = assertEligible(profile, booking);
  const actor = actorOf(user);
  const entry = planTransition(booking, S.SCHEDULE_PROPOSED, actor, {
    note: 'Technician accepted and proposed an arrival time',
  });
  const proposal = proposalFrom(techId, body, 1);

  const updated = await Booking.findOneAndUpdate(
    {
      _id: booking._id,
      status: S.SEARCHING_TECHNICIAN,
      technicianId: null,
      excludedTechnicians: { $ne: techId },
    },
    {
      $set: {
        technicianId: techId,
        proposedSchedule: proposal,
        scheduleStatus: SCHEDULE_STATUS.PENDING,
        status: S.SCHEDULE_PROPOSED,
        estimatedCost: body.estimatedFee ?? profile.visitFee,
      },
      $push: { statusHistory: entry, scheduleHistory: proposal },
    },
    { new: true, runValidators: true },
  );
  if (!updated) {
    throw ApiError.conflict(
      'Another technician has already taken this job',
      ERROR_CODES.ALREADY_TAKEN,
    );
  }

  if (wasNotified(updated, techId)) {
    await Booking.updateOne(
      { _id: updated._id, 'notifiedTechnicians.technicianId': techId },
      { $set: { 'notifiedTechnicians.$.response': NOTIFIED_RESPONSE.ACCEPTED } },
      { timestamps: false },
    );
  } else {
    await Booking.updateOne(
      { _id: updated._id },
      {
        $push: {
          notifiedTechnicians: {
            technicianId: techId,
            distanceKm,
            notifiedAt: new Date(),
            response: NOTIFIED_RESPONSE.ACCEPTED,
          },
        },
      },
      { timestamps: false },
    );
  }

  const fresh = await Booking.findById(updated._id);
  const summary = await bookingSummary(fresh);
  const otherTechRooms = fresh.notifiedTechnicians
    .filter((n) => idOf(n.technicianId) !== techId)
    .map((n) => toUser(n.technicianId));
  emitTo(otherTechRooms, SOCKET_EVENTS.BOOKING_TAKEN, {
    bookingId: String(fresh._id),
    booking: summary,
  });
  emitTo([toUser(fresh.customerId), toBooking(fresh._id)], SOCKET_EVENTS.SCHEDULE_PROPOSED, {
    bookingId: String(fresh._id),
    booking: summary,
    proposal: fresh.proposedSchedule,
  });
  await notify(fresh.customerId, {
    type: 'SCHEDULE_PROPOSED',
    title: `${user.name} accepted your request`,
    body: `Proposed arrival: ${proposal.timeSlotLabel}`,
    bookingId: fresh._id,
    summary,
  });

  return present(fresh, user, 'assigned', profile);
}

// ---------------------------------------------------------------------------
// 6. Propose a new time
// ---------------------------------------------------------------------------

export async function proposeSchedule(bookingId, user, body) {
  const { booking } = await loadBookingFor(bookingId, user, { allow: ['assigned'] });
  const { status, scheduleStatus } = booking;
  const expected =
    (status === S.SCHEDULE_PROPOSED && scheduleStatus === SCHEDULE_STATUS.RESCHEDULE_REQUESTED) ||
    status === S.CONFIRMED_SCHEDULED;
  if (!expected) {
    throw new ApiError(
      409,
      ERROR_CODES.INVALID_TRANSITION,
      'A new time can be proposed only after the customer asks for one, or to change a confirmed time',
      { from: status, to: S.SCHEDULE_PROPOSED, scheduleStatus },
    );
  }

  const round = (booking.proposedSchedule?.round ?? 0) + 1;
  if (round > env.MAX_PROPOSAL_ROUNDS) {
    throw ApiError.conflict(
      `At most ${env.MAX_PROPOSAL_ROUNDS} proposals are allowed for one booking`,
      ERROR_CODES.MAX_ROUNDS_REACHED,
      { round, max: env.MAX_PROPOSAL_ROUNDS },
    );
  }

  const entry = planTransition(booking, S.SCHEDULE_PROPOSED, actorOf(user), {
    note: `New arrival time proposed (round ${round})`,
  });
  const proposal = proposalFrom(user.id, body, round);
  const updated = await commit(booking, {
    $set: {
      status: S.SCHEDULE_PROPOSED,
      proposedSchedule: proposal,
      scheduleStatus: SCHEDULE_STATUS.PENDING,
      ...(body.estimatedFee !== undefined ? { estimatedCost: body.estimatedFee } : {}),
    },
    $push: { statusHistory: entry, scheduleHistory: proposal },
  });

  const summary = await bookingSummary(updated);
  emitTo([toUser(updated.customerId), toBooking(updated._id)], SOCKET_EVENTS.SCHEDULE_PROPOSED, {
    bookingId: String(updated._id),
    booking: summary,
    proposal: updated.proposedSchedule,
  });
  await notify(updated.customerId, {
    type: 'SCHEDULE_PROPOSED',
    title: `${user.name} proposed a new arrival time`,
    body: `${proposal.timeSlotLabel} (proposal ${round})`,
    bookingId: updated._id,
    summary,
  });

  return present(updated, user, 'assigned');
}

// ---------------------------------------------------------------------------
// Shared reset for DECLINE_TECHNICIAN and RELEASE (DECISIONS #5, #6)
// ---------------------------------------------------------------------------

async function resetToSearching(booking, actor, response, note, extraSet = {}) {
  const techId = booking.technicianId;
  const entry = planTransition(booking, S.SEARCHING_TECHNICIAN, actor, { note });
  const updated = await commit(
    booking,
    {
      $set: {
        status: S.SEARCHING_TECHNICIAN,
        technicianId: null,
        proposedSchedule: null,
        scheduleStatus: SCHEDULE_STATUS.NONE,
        liveLocation: null,
        'notifiedTechnicians.$[tech].response': response,
        ...extraSet,
      },
      $unset: { estimatedCost: 1 },
      $addToSet: { excludedTechnicians: techId },
      $push: { statusHistory: entry },
    },
    { arrayFilters: [{ 'tech.technicianId': techId }] },
  );
  removeUserFromBookingRoom(techId, updated._id);
  return { updated, techId };
}

// ---------------------------------------------------------------------------
// 7. Customer responds to a proposal
// ---------------------------------------------------------------------------

export async function respondSchedule(bookingId, user, { action, note = '' }) {
  const { booking } = await loadBookingFor(bookingId, user, { allow: ['owner'] });
  const actor = actorOf(user);

  if (booking.status !== S.SCHEDULE_PROPOSED) {
    throw new ApiError(409, ERROR_CODES.INVALID_TRANSITION, 'There is no proposal to respond to', {
      from: booking.status,
      to: action === SCHEDULE_RESPONSE.ACCEPT ? S.CONFIRMED_SCHEDULED : S.SEARCHING_TECHNICIAN,
    });
  }

  const idx = booking.scheduleHistory.length - 1;
  const responseFields = {
    [`scheduleHistory.${idx}.response`]: action,
    [`scheduleHistory.${idx}.responseNote`]: note,
    [`scheduleHistory.${idx}.respondedAt`]: new Date(),
  };
  const waitingForTech = booking.scheduleStatus !== SCHEDULE_STATUS.PENDING;
  const techId = booking.technicianId;
  let updated;

  if (action === SCHEDULE_RESPONSE.ACCEPT) {
    if (waitingForTech) {
      throw new ApiError(
        409,
        ERROR_CODES.INVALID_TRANSITION,
        'Waiting for the technician to propose a new time',
        {
          from: booking.status,
          to: S.CONFIRMED_SCHEDULED,
          scheduleStatus: booking.scheduleStatus,
        },
      );
    }
    const entry = planTransition(booking, S.CONFIRMED_SCHEDULED, actor, {
      note: note || 'Customer confirmed the arrival time',
    });
    updated = await commit(booking, {
      $set: {
        status: S.CONFIRMED_SCHEDULED,
        scheduleStatus: SCHEDULE_STATUS.ACCEPTED,
        ...responseFields,
      },
      $push: { statusHistory: entry },
    });
  } else if (action === SCHEDULE_RESPONSE.REQUEST_NEW_TIME) {
    if (waitingForTech) {
      throw new ApiError(
        409,
        ERROR_CODES.INVALID_TRANSITION,
        'A new time has already been requested',
        {
          from: booking.status,
          to: S.SCHEDULE_PROPOSED,
          scheduleStatus: booking.scheduleStatus,
        },
      );
    }
    const round = booking.proposedSchedule?.round ?? 1;
    if (round >= env.MAX_PROPOSAL_ROUNDS) {
      throw ApiError.conflict(
        `The ${env.MAX_PROPOSAL_ROUNDS}-proposal limit is reached: accept this time or decline the technician`,
        ERROR_CODES.MAX_ROUNDS_REACHED,
        { round, max: env.MAX_PROPOSAL_ROUNDS },
      );
    }
    // No status change: the booking stays SCHEDULE_PROPOSED while the technician re-proposes.
    updated = await commit(booking, {
      $set: { scheduleStatus: SCHEDULE_STATUS.RESCHEDULE_REQUESTED, ...responseFields },
    });
  } else {
    ({ updated } = await resetToSearching(
      booking,
      actor,
      NOTIFIED_RESPONSE.DECLINED,
      note ? `Customer declined the technician: ${note}` : 'Customer declined the technician',
      responseFields,
    ));
  }

  const summary = await bookingSummary(updated);
  emitTo([toUser(techId), toBooking(updated._id)], SOCKET_EVENTS.SCHEDULE_RESPONDED, {
    bookingId: String(updated._id),
    booking: summary,
    action,
    note,
    customerName: user.name,
  });
  const titles = {
    [SCHEDULE_RESPONSE.ACCEPT]: 'The customer confirmed your arrival time',
    [SCHEDULE_RESPONSE.REQUEST_NEW_TIME]: 'The customer asked for another time',
    [SCHEDULE_RESPONSE.DECLINE_TECHNICIAN]: 'The customer chose another technician',
  };
  await notify(techId, {
    type: 'SCHEDULE_RESPONDED',
    title: titles[action],
    body: note ? `${updated.bookingCode}: ${note}` : updated.bookingCode,
    bookingId: updated._id,
    summary: action === SCHEDULE_RESPONSE.DECLINE_TECHNICIAN ? null : summary,
  });

  let matchedCount;
  if (action === SCHEDULE_RESPONSE.DECLINE_TECHNICIAN) {
    ({ matchedCount } = await broadcast(updated));
  }

  const fresh = await Booking.findById(updated._id);
  const result = { booking: await present(fresh, user, 'owner') };
  if (matchedCount !== undefined) result.matchedCount = matchedCount;
  return result;
}

// ---------------------------------------------------------------------------
// 8. Technician releases the job
// ---------------------------------------------------------------------------

export async function releaseBooking(bookingId, user, { reason }) {
  const { booking } = await loadBookingFor(bookingId, user, { allow: ['assigned'] });
  const { updated } = await resetToSearching(
    booking,
    actorOf(user),
    NOTIFIED_RESPONSE.RELEASED,
    `Technician released the job: ${reason}`,
  );

  const summary = await bookingSummary(updated, { technician: null });
  emitTo(
    [toBooking(updated._id), toUser(updated.customerId)],
    SOCKET_EVENTS.BOOKING_STATUS_UPDATED,
    {
      bookingId: String(updated._id),
      booking: summary,
      status: updated.status,
      note: reason,
    },
  );
  await notify(updated.customerId, {
    type: 'STATUS_UPDATED',
    title: 'Your technician released the job',
    body: `We are finding another technician for ${updated.bookingCode}. Reason: ${reason}`,
    bookingId: updated._id,
    summary,
  });
  const { matchedCount } = await broadcast(updated);

  return { bookingId: String(updated._id), status: updated.status, matchedCount };
}

// ---------------------------------------------------------------------------
// 9. Job progress
// ---------------------------------------------------------------------------

const STATUS_COPY = {
  [S.ON_THE_WAY]: 'Your technician is on the way',
  [S.IN_PROGRESS]: 'Your repair has started',
  [S.COMPLETED]: 'Your repair is complete',
};

export async function updateStatus(bookingId, user, { status, note = '', finalCost }) {
  const profile = await TechnicianProfile.findOne({ userId: user.id }).lean();
  const { booking } = await loadBookingFor(bookingId, user, { allow: ['assigned'], profile });
  const entry = planTransition(booking, status, actorOf(user), { note, finalCost });
  const now = new Date();
  const $set = { status };

  if (status === S.ON_THE_WAY) {
    const here = fromPoint(profile?.currentLocation);
    const there = fromPoint(booking.location);
    $set.liveLocation =
      here && there
        ? { ...here, etaMinutes: etaMinutes(haversineKm(here, there)), updatedAt: now }
        : null;
  }
  if (status === S.IN_PROGRESS) $set.liveLocation = null;
  if (status === S.COMPLETED) {
    $set.finalCost = finalCost;
    $set.completedAt = now;
    $set.liveLocation = null;
  }

  const updated = await commit(booking, { $set, $push: { statusHistory: entry } });
  if (status === S.COMPLETED) {
    await TechnicianProfile.updateOne({ userId: user.id }, { $inc: { completedJobs: 1 } });
  }

  const summary = await bookingSummary(updated);
  emitTo(
    [toBooking(updated._id), toUser(updated.customerId), toUser(user.id)],
    SOCKET_EVENTS.BOOKING_STATUS_UPDATED,
    { bookingId: String(updated._id), booking: summary, status, note },
  );
  await notify(updated.customerId, {
    type: 'STATUS_UPDATED',
    title: STATUS_COPY[status],
    body:
      status === S.COMPLETED
        ? `${updated.bookingCode}: final cost ${updated.currency} ${finalCost}. Please leave a review.`
        : `${updated.bookingCode}${note ? `: ${note}` : ''}`,
    bookingId: updated._id,
    summary,
  });

  return present(updated, user, 'assigned', profile);
}

/**
 * Rough straight-line ETA at ETA_SPEED_KMH (25 km/h), in whole minutes. Real road distance
 * and traffic are not considered; it is a display hint, not a promise.
 */
export function etaMinutes(distanceKm) {
  return Math.ceil((distanceKm / ETA_SPEED_KMH) * 60);
}

// ---------------------------------------------------------------------------
// 10. Cancel
// ---------------------------------------------------------------------------

export async function cancelBooking(bookingId, user, { reason }) {
  const { booking, relation } = await loadBookingFor(bookingId, user, {
    allow: ['owner', 'assigned', 'admin'],
  });
  const actor = actorOf(user);
  const entry = planTransition(booking, S.CANCELLED, actor, { note: reason });
  const updated = await commit(booking, {
    $set: {
      status: S.CANCELLED,
      cancellation: { by: user.id, role: user.role, reason, at: new Date() },
      liveLocation: null,
    },
    $push: { statusHistory: entry },
  });

  const summary = await bookingSummary(updated);
  const techId = idOf(updated.technicianId);
  const customerId = idOf(updated.customerId);
  const pendingTechs = updated.notifiedTechnicians
    .filter((n) => n.response === NOTIFIED_RESPONSE.PENDING && idOf(n.technicianId) !== techId)
    .map((n) => toUser(n.technicianId));

  emitTo(
    [toBooking(updated._id), toUser(customerId), techId && toUser(techId), ...pendingTechs],
    SOCKET_EVENTS.BOOKING_CANCELLED,
    { bookingId: String(updated._id), booking: summary, reason, cancelledBy: user.role },
  );

  const recipients = [];
  if (relation === 'owner' && techId) recipients.push(techId);
  if (relation === 'admin') {
    recipients.push(customerId);
    if (techId) recipients.push(techId);
  }
  for (const recipient of recipients) {
    await notify(recipient, {
      type: 'BOOKING_CANCELLED',
      title: `Booking ${updated.bookingCode} was cancelled`,
      body: reason,
      bookingId: updated._id,
      summary,
    });
  }

  return present(updated, user, relation);
}

// ---------------------------------------------------------------------------
// 11. Re-broadcast
// ---------------------------------------------------------------------------

export async function rebroadcastBooking(bookingId, user) {
  const { booking } = await loadBookingFor(bookingId, user, { allow: ['owner'] });
  if (booking.status !== S.SEARCHING_TECHNICIAN) {
    throw ApiError.conflict(
      'Only bookings that are still searching for a technician can be re-broadcast',
      ERROR_CODES.NOT_SEARCHING,
      { status: booking.status },
    );
  }

  const now = Date.now();
  const claimed = await Booking.findOneAndUpdate(
    {
      _id: booking._id,
      status: S.SEARCHING_TECHNICIAN,
      $or: [
        { lastBroadcastAt: null },
        { lastBroadcastAt: { $lte: new Date(now - REBROADCAST_COOLDOWN_MS) } },
      ],
    },
    { $set: { lastBroadcastAt: new Date(now) } },
    { new: true, timestamps: false },
  );
  if (!claimed) {
    const last = booking.lastBroadcastAt ? booking.lastBroadcastAt.getTime() : now;
    const retryAfterSeconds = Math.max(1, Math.ceil((last + REBROADCAST_COOLDOWN_MS - now) / 1000));
    throw new ApiError(
      429,
      ERROR_CODES.RATE_LIMITED,
      `You can re-broadcast this request again in ${retryAfterSeconds} seconds`,
      { retryAfterSeconds },
    );
  }

  const { matchedCount, notifiedCount } = await broadcast(claimed);
  return { bookingId: String(claimed._id), matchedCount, notifiedCount };
}

// ---------------------------------------------------------------------------
// 12. Review
// ---------------------------------------------------------------------------

export async function reviewBooking(bookingId, user, { rating, comment = '' }) {
  const { booking } = await loadBookingFor(bookingId, user, { allow: ['owner'] });
  if (booking.status !== S.COMPLETED) {
    throw ApiError.conflict('Only completed bookings can be reviewed', ERROR_CODES.NOT_COMPLETED, {
      status: booking.status,
    });
  }
  if (booking.review) {
    throw ApiError.conflict('You have already reviewed this booking', ERROR_CODES.ALREADY_REVIEWED);
  }

  const updated = await Booking.findOneAndUpdate(
    { _id: booking._id, customerId: user.id, status: S.COMPLETED, review: null },
    { $set: { review: { rating, comment, createdAt: new Date() } } },
    { new: true, runValidators: true },
  );
  if (!updated) {
    throw ApiError.conflict('You have already reviewed this booking', ERROR_CODES.ALREADY_REVIEWED);
  }

  // Atomic running average in one pipeline update; both fields read the pre-update values.
  await TechnicianProfile.updateOne({ userId: updated.technicianId }, [
    {
      $set: {
        ratingAvg: {
          $round: [
            {
              $divide: [
                { $add: [{ $multiply: ['$ratingAvg', '$ratingCount'] }, rating] },
                { $add: ['$ratingCount', 1] },
              ],
            },
            2,
          ],
        },
        ratingCount: { $add: ['$ratingCount', 1] },
      },
    },
  ]);

  await notify(updated.technicianId, {
    type: 'REVIEW_RECEIVED',
    title: `You received a ${rating}-star review`,
    body: comment ? `${updated.bookingCode}: "${comment.slice(0, 200)}"` : updated.bookingCode,
    bookingId: updated._id,
    summary: await bookingSummary(updated),
  });

  return present(updated, user, 'owner');
}
