import { queryKeys } from './queryKeys.js';

const time = (v) => (v ? new Date(v).getTime() : 0);

/**
 * Applies the booking summary carried by a socket payload to the cached detail, if it is not
 * older than what is cached (idempotent: replays and out-of-order events are ignored).
 * Returns true when the event was newer and should trigger a refetch of the full detail
 * (allowedActions and histories are not part of the summary).
 */
export function applyBookingSummary(queryClient, payload) {
  const summary = payload?.booking;
  const id = payload?.bookingId ?? summary?._id;
  if (!id || !summary) return false;
  const key = queryKeys.booking(id);
  const cached = queryClient.getQueryData(key);
  if (cached && time(summary.updatedAt) < time(cached.updatedAt)) return false;
  if (cached) {
    queryClient.setQueryData(key, {
      ...cached,
      status: summary.status,
      scheduleStatus: summary.scheduleStatus,
      proposedSchedule: summary.proposedSchedule,
      stage: summary.stage,
      updatedAt: summary.updatedAt,
      technician: summary.technician
        ? { ...(cached.technician ?? {}), ...summary.technician }
        : summary.technician,
    });
  }
  return true;
}

/** Patches only the live location (location events do not change updatedAt). */
export function applyLiveLocation(queryClient, payload) {
  const key = queryKeys.booking(payload.bookingId);
  const cached = queryClient.getQueryData(key);
  if (!cached) return;
  if (cached.liveLocation && time(payload.updatedAt) <= time(cached.liveLocation.updatedAt)) return;
  queryClient.setQueryData(key, {
    ...cached,
    liveLocation: {
      lng: payload.lng,
      lat: payload.lat,
      etaMinutes: payload.etaMinutes,
      updatedAt: payload.updatedAt,
    },
  });
}

/** Appends a chat message to every cached page once (dedupe by _id). */
export function appendMessage(queryClient, bookingId, message) {
  queryClient.setQueryData(queryKeys.messages(bookingId), (old) => {
    if (!old) return old;
    if (old.messages.some((m) => m._id === message._id)) return old;
    return { ...old, messages: [...old.messages, message] };
  });
}

/** Refetch the full detail and any booking list. */
export function refreshBooking(queryClient, bookingId) {
  queryClient.invalidateQueries({ queryKey: queryKeys.booking(bookingId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.bookingsAll });
}
