import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path of backend/uploads. */
export const UPLOAD_DIR = path.resolve(here, '..', '..', 'uploads');
export const UPLOAD_PUBLIC_PREFIX = '/uploads';
export const ALLOWED_IMAGE_TYPES = Object.freeze({
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
});

export const ROLES = Object.freeze({
  CUSTOMER: 'customer',
  TECHNICIAN: 'technician',
  ADMIN: 'admin',
});
export const ROLE_VALUES = Object.freeze(Object.values(ROLES));
export const SELF_REGISTER_ROLES = Object.freeze([ROLES.CUSTOMER, ROLES.TECHNICIAN]);
/** Actor role recorded for automatic transitions (dispatcher, timeouts). */
export const SYSTEM_ROLE = 'system';

// DECISIONS #1
export const BOOKING_STATUS = Object.freeze({
  REQUESTED: 'REQUESTED',
  SEARCHING_TECHNICIAN: 'SEARCHING_TECHNICIAN',
  SCHEDULE_PROPOSED: 'SCHEDULE_PROPOSED',
  CONFIRMED_SCHEDULED: 'CONFIRMED_SCHEDULED',
  ON_THE_WAY: 'ON_THE_WAY',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
});
export const BOOKING_STATUS_VALUES = Object.freeze(Object.values(BOOKING_STATUS));

// DECISIONS #2
export const SCHEDULE_STATUS = Object.freeze({
  NONE: 'NONE',
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  RESCHEDULE_REQUESTED: 'RESCHEDULE_REQUESTED',
  REJECTED: 'REJECTED',
});
export const SCHEDULE_STATUS_VALUES = Object.freeze(Object.values(SCHEDULE_STATUS));

// DECISIONS #5
export const SCHEDULE_RESPONSE = Object.freeze({
  ACCEPT: 'ACCEPT',
  REQUEST_NEW_TIME: 'REQUEST_NEW_TIME',
  DECLINE_TECHNICIAN: 'DECLINE_TECHNICIAN',
});
export const SCHEDULE_RESPONSE_VALUES = Object.freeze(Object.values(SCHEDULE_RESPONSE));

export const NOTIFIED_RESPONSE = Object.freeze({
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  DECLINED: 'DECLINED',
  RELEASED: 'RELEASED',
});
export const NOTIFIED_RESPONSE_VALUES = Object.freeze(Object.values(NOTIFIED_RESPONSE));

export const URGENCY = Object.freeze({ NORMAL: 'NORMAL', URGENT: 'URGENT' });
export const URGENCY_VALUES = Object.freeze(Object.values(URGENCY));

// DECISIONS #10
export const CATEGORY_KEYS = Object.freeze([
  'AC',
  'COMPUTER',
  'PLUMBING',
  'ELECTRICAL',
  'APPLIANCE',
  'CARPENTRY',
]);
/** Shape of a category key; the Category collection is the source of truth for which exist. */
export const CATEGORY_KEY_PATTERN = /^[A-Z][A-Z_]{1,29}$/;

export const NOTIFICATION_TYPES = Object.freeze([
  'NEW_REQUEST',
  'SCHEDULE_PROPOSED',
  'SCHEDULE_RESPONDED',
  'STATUS_UPDATED',
  'BOOKING_CANCELLED',
  'NEW_MESSAGE',
  'REVIEW_RECEIVED',
  'TECH_VERIFIED',
]);
export const NOTIFICATION_TTL_SECONDS = 90 * 24 * 60 * 60;

export const BCRYPT_ROUNDS = 12;
export const MAX_REFRESH_TOKENS_PER_USER = 5;
export const MAX_SAVED_ADDRESSES = 10;
export const MAX_BOOKING_IMAGES = 5;

export const REFRESH_COOKIE_NAME = 'rh_refresh';
export const REFRESH_COOKIE_PATH = '/api/auth';
export const JWT_ISSUER = 'repairhub';
export const JWT_AUDIENCE_ACCESS = 'repairhub:access';
export const JWT_AUDIENCE_REFRESH = 'repairhub:refresh';

export const BOOKING_CODE_PREFIX = 'REP';
/** Codes are BOOKING_CODE_START + counter, so the first code of a year is REP-<year>-1001. */
export const BOOKING_CODE_START = 1000;

export const ERROR_CODES = Object.freeze({
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_ID: 'INVALID_ID',
  INVALID_JSON: 'INVALID_JSON',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  DUPLICATE: 'DUPLICATE',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_TAKEN: 'ALREADY_TAKEN',
  RATE_LIMITED: 'RATE_LIMITED',
  ADDRESS_LIMIT_REACHED: 'ADDRESS_LIMIT_REACHED',
  UPLOAD_INVALID_TYPE: 'UPLOAD_INVALID_TYPE',
  UPLOAD_TOO_LARGE: 'UPLOAD_TOO_LARGE',
  UPLOAD_TOO_MANY_FILES: 'UPLOAD_TOO_MANY_FILES',
  UPLOAD_ERROR: 'UPLOAD_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  // Phase 2
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  BOOKING_CHANGED: 'BOOKING_CHANGED',
  MAX_ROUNDS_REACHED: 'MAX_ROUNDS_REACHED',
  NOT_ELIGIBLE: 'NOT_ELIGIBLE',
  INVALID_CATEGORY: 'INVALID_CATEGORY',
  LOCATION_REQUIRED: 'LOCATION_REQUIRED',
  CATEGORIES_REQUIRED: 'CATEGORIES_REQUIRED',
  ALREADY_REVIEWED: 'ALREADY_REVIEWED',
  CHAT_UNAVAILABLE: 'CHAT_UNAVAILABLE',
  NOT_SEARCHING: 'NOT_SEARCHING',
  NOT_COMPLETED: 'NOT_COMPLETED',
});

// ---- Phase 2: booking engine ----

/** Statuses before the technician leaves for the job (DECISIONS #6). */
export const PRE_DEPARTURE_STATUSES = Object.freeze([
  BOOKING_STATUS.REQUESTED,
  BOOKING_STATUS.SEARCHING_TECHNICIAN,
  BOOKING_STATUS.SCHEDULE_PROPOSED,
  BOOKING_STATUS.CONFIRMED_SCHEDULED,
]);
export const FINISHED_STATUSES = Object.freeze([
  BOOKING_STATUS.COMPLETED,
  BOOKING_STATUS.CANCELLED,
]);
/** From these statuses the assigned technician sees the exact address and the customer phone. */
export const CONTACT_REVEALED_STATUSES = Object.freeze([
  BOOKING_STATUS.CONFIRMED_SCHEDULED,
  BOOKING_STATUS.ON_THE_WAY,
  BOOKING_STATUS.IN_PROGRESS,
  BOOKING_STATUS.COMPLETED,
]);

/** Button keys for the frontend; it renders actions ONLY from allowedActions(). */
export const BOOKING_ACTIONS = Object.freeze({
  ACCEPT_AND_SCHEDULE: 'ACCEPT_AND_SCHEDULE',
  ACCEPT_SCHEDULE: 'ACCEPT_SCHEDULE',
  REQUEST_NEW_TIME: 'REQUEST_NEW_TIME',
  DECLINE_TECHNICIAN: 'DECLINE_TECHNICIAN',
  PROPOSE_SCHEDULE: 'PROPOSE_SCHEDULE',
  RELEASE: 'RELEASE',
  MARK_ON_THE_WAY: 'MARK_ON_THE_WAY',
  START_REPAIR: 'START_REPAIR',
  COMPLETE: 'COMPLETE',
  CANCEL: 'CANCEL',
  REVIEW: 'REVIEW',
  REBROADCAST: 'REBROADCAST',
  CHAT: 'CHAT',
});

export const TRACKER_STAGES = Object.freeze([
  { stage: 1, label: 'Request sent and nearby technicians notified' },
  { stage: 2, label: 'Technician proposed arrival time' },
  { stage: 3, label: 'Customer confirmed' },
  { stage: 4, label: 'On the way' },
  { stage: 5, label: 'In progress' },
  { stage: 6, label: 'Completed' },
]);

export const DISPATCH_LIMIT = 20;
export const REBROADCAST_COOLDOWN_MS = 2 * 60 * 1000;
export const LOCATION_THROTTLE_MS = 10 * 1000;
/** Rough straight-line ETA speed for Kathmandu traffic. */
export const ETA_SPEED_KMH = 25;
export const SCHEDULE_MIN_LEAD_MS = 15 * 60 * 1000;
export const SCHEDULE_MAX_LEAD_MS = 14 * 24 * 60 * 60 * 1000;
export const MAX_BOOKING_PAGE_SIZE = 50;

export const SOCKET_EVENTS = Object.freeze({
  // client -> server
  JOIN_USER_ROOM: 'join_user_room',
  JOIN_BOOKING_ROOM: 'join_booking_room',
  LEAVE_BOOKING_ROOM: 'leave_booking_room',
  TECHNICIAN_LOCATION_UPDATE: 'technician_location_update',
  TYPING: 'typing',
  // server -> client
  NEW_REPAIR_REQUEST: 'new_repair_request',
  BOOKING_TAKEN: 'booking_taken',
  SCHEDULE_PROPOSED: 'schedule_proposed',
  SCHEDULE_RESPONDED: 'schedule_responded',
  BOOKING_STATUS_UPDATED: 'booking_status_updated',
  BOOKING_CANCELLED: 'booking_cancelled',
  BOOKING_MESSAGE: 'booking_message',
  TECHNICIAN_LOCATION_UPDATED: 'technician_location_updated',
  NOTIFICATION_NEW: 'notification:new',
});
