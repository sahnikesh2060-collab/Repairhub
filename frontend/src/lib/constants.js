/** Display metadata shared by StatusBadge, BookingTracker and lists. Defined once here. */

export const CURRENCY = import.meta.env.VITE_CURRENCY || 'NPR';
export const MAP_DEFAULT = {
  lat: Number(import.meta.env.VITE_MAP_DEFAULT_LAT || 27.7172),
  lng: Number(import.meta.env.VITE_MAP_DEFAULT_LNG || 85.324),
};
export const MAP_TILE_URL =
  import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const MAP_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// Mirrors backend upload limits (UPLOAD_MAX_FILES, UPLOAD_MAX_MB, allowed types).
export const MAX_IMAGES = 5;
export const MAX_IMAGE_MB = 5;
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const STATUS = Object.freeze({
  REQUESTED: {
    label: 'Requested',
    badge: 'bg-amber-50 text-amber-800 ring-amber-200',
    dot: 'bg-amber-500',
  },
  SEARCHING_TECHNICIAN: {
    label: 'Finding technician',
    badge: 'bg-amber-50 text-amber-800 ring-amber-200',
    dot: 'bg-amber-500',
  },
  SCHEDULE_PROPOSED: {
    label: 'Time proposed',
    badge: 'bg-violet-50 text-violet-800 ring-violet-200',
    dot: 'bg-violet-500',
  },
  CONFIRMED_SCHEDULED: {
    label: 'Confirmed',
    badge: 'bg-blue-50 text-blue-800 ring-blue-200',
    dot: 'bg-blue-600',
  },
  ON_THE_WAY: {
    label: 'On the way',
    badge: 'bg-indigo-50 text-indigo-800 ring-indigo-200',
    dot: 'bg-indigo-600',
  },
  IN_PROGRESS: {
    label: 'In progress',
    badge: 'bg-cyan-50 text-cyan-800 ring-cyan-200',
    dot: 'bg-cyan-600',
  },
  COMPLETED: {
    label: 'Completed',
    badge: 'bg-green-50 text-green-800 ring-green-200',
    dot: 'bg-green-600',
  },
  CANCELLED: {
    label: 'Cancelled',
    badge: 'bg-red-50 text-red-800 ring-red-200',
    dot: 'bg-red-600',
  },
});

export const SCHEDULE_STATUS_LABEL = Object.freeze({
  NONE: '',
  PENDING: 'Waiting for your answer',
  ACCEPTED: 'Time confirmed',
  RESCHEDULE_REQUESTED: 'New time requested',
  REJECTED: 'Declined',
});

/** Customer-facing tracker labels for backend stages 1-6. */
export const CUSTOMER_STAGES = Object.freeze([
  { stage: 1, label: 'Request sent', detail: 'Nearby technicians notified' },
  { stage: 2, label: 'Time proposed', detail: 'Technician proposed arrival time' },
  { stage: 3, label: 'Confirmed', detail: 'You confirmed the schedule' },
  { stage: 4, label: 'On the way', detail: 'Technician on the way' },
  { stage: 5, label: 'In progress', detail: 'Repair in progress' },
  { stage: 6, label: 'Completed', detail: 'Job completed' },
]);

/** The first status of each stage, used to read step times from statusHistory. */
export const STAGE_STATUSES = Object.freeze({
  1: ['SEARCHING_TECHNICIAN', 'REQUESTED'],
  2: ['SCHEDULE_PROPOSED'],
  3: ['CONFIRMED_SCHEDULED'],
  4: ['ON_THE_WAY'],
  5: ['IN_PROGRESS'],
  6: ['COMPLETED'],
});

export const ACTIONS = Object.freeze({
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

export const ROLE_HOME = Object.freeze({
  customer: '/customer',
  technician: '/technician',
  admin: '/admin',
});

export const ROLE_LABEL = Object.freeze({
  customer: 'Customer',
  technician: 'Technician',
  admin: 'Admin',
  system: 'System',
});

export const MAX_PROPOSAL_ROUNDS = 3;

/** Technician-facing tracker labels for backend stages 1-6. */
export const TECHNICIAN_STAGES = Object.freeze([
  { stage: 1, label: 'New request', detail: 'Nearby technicians notified' },
  { stage: 2, label: 'Time proposed', detail: 'Waiting for the customer' },
  { stage: 3, label: 'Confirmed', detail: 'Customer confirmed the time' },
  { stage: 4, label: 'On the way', detail: 'Sharing your location' },
  { stage: 5, label: 'In progress', detail: 'Repair under way' },
  { stage: 6, label: 'Completed', detail: 'Job completed' },
]);

/** Chart colours per status (same hues as the badges). */
export const STATUS_HEX = Object.freeze({
  REQUESTED: '#f59e0b',
  SEARCHING_TECHNICIAN: '#d97706',
  SCHEDULE_PROPOSED: '#8b5cf6',
  CONFIRMED_SCHEDULED: '#2563eb',
  ON_THE_WAY: '#4f46e5',
  IN_PROGRESS: '#0891b2',
  COMPLETED: '#16a34a',
  CANCELLED: '#dc2626',
});
