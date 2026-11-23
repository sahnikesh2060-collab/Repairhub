import { env } from '../config/env.js';
import {
  BOOKING_ACTIONS as A,
  BOOKING_STATUS as S,
  ERROR_CODES,
  FINISHED_STATUSES,
  PRE_DEPARTURE_STATUSES,
  ROLES,
  SCHEDULE_STATUS,
  SYSTEM_ROLE,
  TRACKER_STAGES,
} from '../config/constants.js';
import { Booking } from '../models/Booking.js';
import { ApiError } from '../utils/ApiError.js';
import { idOf, isNil } from '../utils/ids.js';

/** Actor for automatic transitions (dispatch). */
export const SYSTEM_ACTOR = Object.freeze({ id: null, role: SYSTEM_ROLE });

const actorIdOf = (actor) => {
  if (!actor) return null;
  if (!isNil(actor.id)) return String(actor.id);
  if (!isNil(actor._id)) return String(actor._id);
  return null;
};

// ---- Who may act ----

function who(label, test) {
  test.label = label;
  return test;
}

export const isSystem = who('the system', (_b, a) => !a || a.role === SYSTEM_ROLE);
export const isOwner = who(
  'the customer who created the booking',
  (b, a) => a?.role === ROLES.CUSTOMER && idOf(b.customerId) === actorIdOf(a),
);
export const isAssignedTechnician = who(
  'the assigned technician',
  (b, a) =>
    a?.role === ROLES.TECHNICIAN && !isNil(b.technicianId) && idOf(b.technicianId) === actorIdOf(a),
);
export const isAdmin = who('an admin', (_b, a) => a?.role === ROLES.ADMIN);
const isTechnician = who('a technician', (_b, a) => a?.role === ROLES.TECHNICIAN);
const ownerOrAssigned = who(
  'the customer or the assigned technician',
  (b, a) => isOwner(b, a) || isAssignedTechnician(b, a),
);
const ownerOrAdmin = who('the customer or an admin', (b, a) => isOwner(b, a) || isAdmin(b, a));

// ---- The transition table (single source of truth) ----

const TRANSITIONS = Object.freeze([
  { from: [S.REQUESTED], to: S.SEARCHING_TECHNICIAN, who: isSystem },
  { from: [S.SEARCHING_TECHNICIAN], to: S.SCHEDULE_PROPOSED, who: isTechnician },
  { from: [S.SCHEDULE_PROPOSED], to: S.SCHEDULE_PROPOSED, who: isAssignedTechnician },
  { from: [S.SCHEDULE_PROPOSED], to: S.CONFIRMED_SCHEDULED, who: isOwner },
  { from: [S.SCHEDULE_PROPOSED], to: S.SEARCHING_TECHNICIAN, who: ownerOrAssigned },
  { from: [S.CONFIRMED_SCHEDULED], to: S.SCHEDULE_PROPOSED, who: isAssignedTechnician },
  { from: [S.CONFIRMED_SCHEDULED], to: S.SEARCHING_TECHNICIAN, who: isAssignedTechnician },
  { from: [S.CONFIRMED_SCHEDULED], to: S.ON_THE_WAY, who: isAssignedTechnician },
  { from: [S.ON_THE_WAY], to: S.IN_PROGRESS, who: isAssignedTechnician },
  {
    from: [S.IN_PROGRESS],
    to: S.COMPLETED,
    who: isAssignedTechnician,
    requires: (booking, ctx) =>
      isNil(ctx.finalCost) && isNil(booking.finalCost)
        ? { field: 'finalCost', message: 'finalCost is required to complete a booking' }
        : null,
  },
  { from: [...PRE_DEPARTURE_STATUSES], to: S.CANCELLED, who: ownerOrAdmin },
  { from: [S.ON_THE_WAY, S.IN_PROGRESS], to: S.CANCELLED, who: isAdmin },
]);

/** The table, for documentation and tests. */
export const TRANSITION_TABLE = TRANSITIONS.map((t) => ({
  from: [...t.from],
  to: t.to,
  who: t.who.label,
}));

function findRule(from, to) {
  return TRANSITIONS.find((t) => t.to === to && t.from.includes(from)) ?? null;
}

/**
 * Throws unless `actor` may move `booking` to `toStatus`:
 * 409 INVALID_TRANSITION (not in the table), 403 FORBIDDEN (wrong actor),
 * 422 VALIDATION_ERROR (a requirement such as finalCost is missing).
 */
export function assertTransition(
  booking,
  toStatus,
  actor,
  context = {},
  { checkRequirements = true } = {},
) {
  const from = booking.status;
  const rule = findRule(from, toStatus);
  if (!rule) {
    throw new ApiError(
      409,
      ERROR_CODES.INVALID_TRANSITION,
      `A booking cannot move from ${from} to ${toStatus}`,
      { from, to: toStatus },
    );
  }
  if (!rule.who(booking, actor)) {
    throw new ApiError(
      403,
      ERROR_CODES.FORBIDDEN,
      `Only ${rule.who.label} can move this booking from ${from} to ${toStatus}`,
      { from, to: toStatus },
    );
  }
  if (checkRequirements && rule.requires) {
    const problem = rule.requires(booking, context);
    if (problem) {
      throw ApiError.unprocessable(problem.message, ERROR_CODES.VALIDATION_ERROR, [problem]);
    }
  }
  return rule;
}

/** True when the transition is in the table and `user` may perform it (requirements ignored). */
export function canTransition(booking, toStatus, user) {
  try {
    assertTransition(booking, toStatus, user, {}, { checkRequirements: false });
    return true;
  } catch (_err) {
    return false;
  }
}

/** A statusHistory entry for `status` by `actor`. */
export function statusEntry(status, actor, note = '') {
  return {
    status,
    note,
    updatedBy: actorIdOf(actor),
    role: actor?.role ?? SYSTEM_ROLE,
    timestamp: new Date(),
  };
}

/**
 * Validates a transition and returns the statusHistory entry to $push, for atomic
 * findOneAndUpdate writes. The caller must also $set { status: toStatus }.
 */
export function planTransition(booking, toStatus, actor, { note = '', ...context } = {}) {
  assertTransition(booking, toStatus, actor, context);
  return statusEntry(toStatus, actor, note);
}

/**
 * Validates and applies a transition to an in-memory booking document (sets status and
 * appends statusHistory via Booking.pushStatus). The caller saves the document.
 */
export function transition(booking, toStatus, actor, { note = '', ...context } = {}) {
  assertTransition(booking, toStatus, actor, context);
  Booking.pushStatus(booking, toStatus, actor ?? SYSTEM_ACTOR, note);
  return booking;
}

// ---- Derived views ----

const idIn = (list, id) => (list ?? []).some((x) => idOf(x) === id);

/**
 * The actions the frontend may offer `user` for this booking. Buttons are rendered ONLY
 * from this list; the server re-checks everything when the action is called.
 */
export function allowedActions(booking, user) {
  if (!user) return [];
  const actions = [];
  const { status, scheduleStatus } = booking;
  const round = booking.proposedSchedule?.round ?? 0;
  const roundsLeft = round < env.MAX_PROPOSAL_ROUNDS;
  const userId = actorIdOf(user);

  if (isOwner(booking, user)) {
    if (status === S.SCHEDULE_PROPOSED && scheduleStatus === SCHEDULE_STATUS.PENDING) {
      actions.push(A.ACCEPT_SCHEDULE);
      if (roundsLeft) actions.push(A.REQUEST_NEW_TIME);
    }
    if (status === S.SCHEDULE_PROPOSED) actions.push(A.DECLINE_TECHNICIAN);
    if (status === S.SEARCHING_TECHNICIAN) actions.push(A.REBROADCAST);
    if (status === S.COMPLETED && !booking.review) actions.push(A.REVIEW);
  }

  if (isAssignedTechnician(booking, user)) {
    const awaitingProposal =
      (status === S.SCHEDULE_PROPOSED && scheduleStatus === SCHEDULE_STATUS.RESCHEDULE_REQUESTED) ||
      status === S.CONFIRMED_SCHEDULED;
    if (awaitingProposal && roundsLeft) actions.push(A.PROPOSE_SCHEDULE);
    if (canTransition(booking, S.SEARCHING_TECHNICIAN, user)) actions.push(A.RELEASE);
    if (canTransition(booking, S.ON_THE_WAY, user)) actions.push(A.MARK_ON_THE_WAY);
    if (canTransition(booking, S.IN_PROGRESS, user)) actions.push(A.START_REPAIR);
    if (canTransition(booking, S.COMPLETED, user)) actions.push(A.COMPLETE);
  }

  if (
    user.role === ROLES.TECHNICIAN &&
    status === S.SEARCHING_TECHNICIAN &&
    isNil(booking.technicianId) &&
    !idIn(booking.excludedTechnicians, userId) &&
    idOf(booking.customerId) !== userId
  ) {
    actions.push(A.ACCEPT_AND_SCHEDULE);
  }

  if (canTransition(booking, S.CANCELLED, user)) actions.push(A.CANCEL);

  if (
    (isOwner(booking, user) || isAssignedTechnician(booking, user)) &&
    !isNil(booking.technicianId) &&
    !FINISHED_STATUSES.includes(status)
  ) {
    actions.push(A.CHAT);
  }

  return actions;
}

const STAGE_BY_STATUS = Object.freeze({
  [S.REQUESTED]: 1,
  [S.SEARCHING_TECHNICIAN]: 1,
  [S.SCHEDULE_PROPOSED]: 2,
  [S.CONFIRMED_SCHEDULED]: 3,
  [S.ON_THE_WAY]: 4,
  [S.IN_PROGRESS]: 5,
  [S.COMPLETED]: 6,
});

const labelOf = (stage) => TRACKER_STAGES.find((s) => s.stage === stage)?.label ?? '';

/**
 * Position on the 6-step tracker. CANCELLED reports the stage the booking had reached
 * before it was cancelled, with cancelled: true.
 */
export function stageOf(booking) {
  if (booking.status !== S.CANCELLED) {
    const stage = STAGE_BY_STATUS[booking.status] ?? 1;
    return { stage, label: labelOf(stage), cancelled: false };
  }
  const history = booking.statusHistory ?? [];
  let stage = 1;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i].status !== S.CANCELLED) {
      stage = STAGE_BY_STATUS[history[i].status] ?? 1;
      break;
    }
  }
  return { stage, label: labelOf(stage), cancelled: true };
}
