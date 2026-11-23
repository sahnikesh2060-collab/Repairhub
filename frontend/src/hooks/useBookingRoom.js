import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSocket } from './useSocket.js';
import {
  appendMessage,
  applyBookingSummary,
  applyLiveLocation,
  refreshBooking,
} from '../lib/bookingCache.js';

const SUMMARY_EVENTS = [
  'schedule_proposed',
  'schedule_responded',
  'booking_status_updated',
  'booking_cancelled',
];

/**
 * Joins booking:<id> (again after every reconnect), leaves on unmount, and keeps the
 * ['booking', id] and ['messages', id] caches current from socket events for this booking only.
 * Status events older than the cached booking are ignored (idempotent).
 */
export function useBookingRoom(bookingId) {
  const { socket, isConnected, connectionId } = useSocket();
  const queryClient = useQueryClient();
  const [typingUser, setTypingUser] = useState(null);
  const typingTimer = useRef(null);
  const lastTypingSent = useRef(0);

  useEffect(() => {
    if (!socket || !isConnected || !bookingId) return undefined;
    socket.emit('join_booking_room', { bookingId });
    return () => {
      if (socket.connected) socket.emit('leave_booking_room', { bookingId });
    };
  }, [socket, isConnected, connectionId, bookingId]);

  useEffect(() => {
    if (!socket || !bookingId) return undefined;
    const mine = (payload) => payload?.bookingId === bookingId;

    const onSummary = (payload) => {
      if (!mine(payload)) return;
      if (applyBookingSummary(queryClient, payload)) refreshBooking(queryClient, bookingId);
    };
    const onMessage = (payload) => {
      if (!mine(payload)) return;
      appendMessage(queryClient, bookingId, payload.message);
      setTypingUser(null);
    };
    const onLocation = (payload) => {
      if (mine(payload)) applyLiveLocation(queryClient, payload);
    };
    const onTyping = (payload) => {
      if (!mine(payload)) return;
      setTypingUser(payload.name);
      clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setTypingUser(null), 3000);
    };

    const handlers = [
      ...SUMMARY_EVENTS.map((event) => [event, onSummary]),
      ['booking_message', onMessage],
      ['technician_location_updated', onLocation],
      ['typing', onTyping],
    ];
    for (const [event, handler] of handlers) socket.on(event, handler);
    return () => {
      for (const [event, handler] of handlers) socket.off(event, handler);
      clearTimeout(typingTimer.current);
    };
  }, [socket, bookingId, queryClient]);

  /** Throttled to one typing event every 2 seconds. */
  const sendTyping = useCallback(() => {
    if (!socket?.connected || !bookingId) return;
    const now = Date.now();
    if (now - lastTypingSent.current < 2000) return;
    lastTypingSent.current = now;
    socket.emit('typing', { bookingId });
  }, [socket, bookingId]);

  return { typingUser, sendTyping, isConnected };
}
