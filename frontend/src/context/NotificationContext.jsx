import { createContext, useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { CalendarClock, X } from 'lucide-react';
import * as notificationsApi from '../api/notifications.api.js';
import { useAuth } from '../hooks/useAuth.js';
import { useSocket } from '../hooks/useSocket.js';
import { queryKeys } from '../lib/queryKeys.js';
import { formatFriendlyDateTime } from '../lib/format.js';

export const NotificationContext = createContext(null);

const BOOKING_LIST_EVENTS = [
  'schedule_proposed',
  'schedule_responded',
  'booking_status_updated',
  'booking_cancelled',
  'booking_taken',
];

/** Where a notification about a booking opens, by role. */
export function bookingPathFor(role, bookingId) {
  if (!bookingId) return null;
  if (role === 'customer') return `/customer/bookings/${bookingId}`;
  if (role === 'technician') return `/technician/jobs/${bookingId}`;
  if (role === 'admin') return `/admin/bookings?open=${bookingId}`;
  return null;
}

function ProposalToast({ t, payload, onView }) {
  const proposal = payload.proposal ?? payload.booking?.proposedSchedule;
  return (
    <div
      role="status"
      className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-violet-200 bg-white p-4 shadow-lg ${t.visible ? 'opacity-100' : 'opacity-0'} transition-opacity`}
    >
      <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-violet-600" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900">
          {payload.booking?.technician?.name ?? 'A technician'} proposed a time
        </p>
        {proposal && (
          <p className="mt-0.5 text-sm text-slate-600">
            {formatFriendlyDateTime(proposal.scheduledDate)} · {proposal.timeSlotLabel}
          </p>
        )}
        <button
          type="button"
          onClick={onView}
          className="mt-2 rounded-md text-sm font-semibold text-blue-600 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          View proposal
        </button>
      </div>
      <button
        type="button"
        onClick={() => toast.dismiss(t.id)}
        className="rounded-md p-1 text-slate-400 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

export function NotificationProvider({ children }) {
  const { user, role } = useAuth();
  const { socket } = useSocket();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;

  const query = useQuery({
    queryKey: queryKeys.notifications,
    queryFn: () => notificationsApi.listNotifications({ limit: 10 }),
    enabled: Boolean(user),
    staleTime: 30_000,
  });
  const notifications = query.data?.notifications ?? [];
  const unreadCount = query.data?.meta?.unreadCount ?? 0;

  useEffect(() => {
    document.title = unreadCount > 0 ? `(${unreadCount}) RepairHub` : 'RepairHub';
  }, [unreadCount]);

  useEffect(() => {
    if (!socket) return undefined;
    const isOnBookingPage = (bookingId) =>
      Boolean(bookingId) && pathRef.current.endsWith(`/${bookingId}`);

    const onNotification = (payload) => {
      const n = payload.notification;
      queryClient.setQueryData(queryKeys.notifications, (old) => {
        if (!old) return old;
        if (old.notifications.some((x) => x._id === n._id)) return old;
        return {
          ...old,
          notifications: [n, ...old.notifications].slice(0, 10),
          meta: { ...old.meta, unreadCount: (old.meta?.unreadCount ?? 0) + 1 },
        };
      });
      if (!queryClient.getQueryData(queryKeys.notifications)) {
        queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
      }
      // The schedule_proposed toast below is richer; the open booking page shows changes live.
      if (n.type === 'SCHEDULE_PROPOSED' && role === 'customer') return;
      // Technicians get the named schedule_responded toast below instead.
      if (n.type === 'SCHEDULE_RESPONDED' && role === 'technician') return;
      if (isOnBookingPage(payload.bookingId)) return;
      toast(n.title, { icon: '🔔', id: n._id });
    };

    // "Sita accepted Today, 3:30 PM" / "asked for another time" / "chose another technician".
    const onResponded = (payload) => {
      if (role !== 'technician') return;
      const who = payload.customerName?.split(' ')[0] ?? 'The customer';
      const when = payload.booking?.proposedSchedule?.scheduledDate;
      const text = {
        ACCEPT: `${who} accepted ${when ? formatFriendlyDateTime(when) : 'your time'}`,
        REQUEST_NEW_TIME: `${who} asked for another time${payload.note ? `: “${payload.note}”` : ''}`,
        DECLINE_TECHNICIAN: `${who} chose another technician`,
      }[payload.action];
      if (!text) return;
      const options = { id: `responded-${payload.bookingId}-${payload.action}`, duration: 7000 };
      if (payload.action === 'ACCEPT') toast.success(text, options);
      else if (payload.action === 'DECLINE_TECHNICIAN') toast.error(text, options);
      else toast(text, { ...options, icon: '🕑' });
    };

    const onProposed = (payload) => {
      if (role !== 'customer' || isOnBookingPage(payload.bookingId)) return;
      toast.custom(
        (t) => (
          <ProposalToast
            t={t}
            payload={payload}
            onView={() => {
              toast.dismiss(t.id);
              navigate(`/customer/bookings/${payload.bookingId}`);
            }}
          />
        ),
        { id: `proposal-${payload.bookingId}`, duration: 10_000 },
      );
    };

    // Any booking change addressed to me refreshes my booking lists (dashboard cards update live).
    const onBookingEvent = () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bookingsAll });
    };

    socket.on('notification:new', onNotification);
    socket.on('schedule_proposed', onProposed);
    socket.on('schedule_responded', onResponded);
    for (const event of BOOKING_LIST_EVENTS) socket.on(event, onBookingEvent);
    return () => {
      socket.off('notification:new', onNotification);
      socket.off('schedule_proposed', onProposed);
      socket.off('schedule_responded', onResponded);
      for (const event of BOOKING_LIST_EVENTS) socket.off(event, onBookingEvent);
    };
  }, [socket, queryClient, navigate, role]);

  const markReadMutation = useMutation({
    mutationFn: notificationsApi.markRead,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications });
      const previous = queryClient.getQueryData(queryKeys.notifications);
      queryClient.setQueryData(queryKeys.notifications, (old) => {
        if (!old) return old;
        const target = old.notifications.find((n) => n._id === id);
        if (!target || target.isRead) return old;
        return {
          ...old,
          notifications: old.notifications.map((n) => (n._id === id ? { ...n, isRead: true } : n)),
          meta: { ...old.meta, unreadCount: Math.max(0, (old.meta?.unreadCount ?? 1) - 1) },
        };
      });
      return { previous };
    },
    onError: (_err, _id, context) => {
      queryClient.setQueryData(queryKeys.notifications, context?.previous);
    },
  });

  const markAllMutation = useMutation({
    mutationFn: notificationsApi.markAllRead,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications });
      const previous = queryClient.getQueryData(queryKeys.notifications);
      queryClient.setQueryData(queryKeys.notifications, (old) =>
        old
          ? {
              ...old,
              notifications: old.notifications.map((n) => ({ ...n, isRead: true })),
              meta: { ...old.meta, unreadCount: 0 },
            }
          : old,
      );
      return { previous };
    },
    onError: (err, _v, context) => {
      queryClient.setQueryData(queryKeys.notifications, context?.previous);
      toast.error(err.message);
    },
  });

  const markRead = useCallback((id) => markReadMutation.mutate(id), [markReadMutation]);
  const markAllRead = useCallback(() => markAllMutation.mutate(), [markAllMutation]);

  const value = useMemo(
    () => ({
      notifications,
      unreadCount,
      isLoading: query.isLoading,
      isError: query.isError,
      refetch: query.refetch,
      markRead,
      markAllRead,
    }),
    [
      notifications,
      unreadCount,
      query.isLoading,
      query.isError,
      query.refetch,
      markRead,
      markAllRead,
    ],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}
