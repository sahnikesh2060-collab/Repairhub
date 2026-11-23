import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Bell, CheckCheck } from 'lucide-react';
import { useNotifications } from '../../hooks/useNotifications.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useNow } from '../../hooks/useNow.js';
import { bookingPathFor } from '../../context/NotificationContext.jsx';
import { relativeTime } from '../../lib/format.js';
import { Spinner } from '../ui/Spinner.jsx';

export function NotificationBell() {
  const { notifications, unreadCount, isLoading, isError, refetch, markRead, markAllRead } =
    useNotifications();
  const { role } = useAuth();
  const navigate = useNavigate();
  const now = useNow(30_000);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => {
      if (!wrapperRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const openNotification = (n) => {
    if (!n.isRead) markRead(n._id);
    setOpen(false);
    const path = bookingPathFor(role, n.bookingId);
    if (path) navigate(path);
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <Bell className="h-5 w-5" aria-hidden />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-3 top-16 z-[900] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[22rem]">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Notifications</p>
            <button
              type="button"
              onClick={markAllRead}
              disabled={unreadCount === 0}
              className="inline-flex items-center gap-1 rounded-md text-xs font-semibold text-blue-600 hover:text-blue-700 disabled:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <CheckCheck className="h-3.5 w-3.5" aria-hidden />
              Mark all read
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {isLoading && (
              <div className="flex justify-center py-6 text-blue-600">
                <Spinner />
              </div>
            )}
            {isError && (
              <div className="px-4 py-6 text-center text-sm text-red-700">
                Could not load notifications.{' '}
                <button type="button" className="font-semibold underline" onClick={() => refetch()}>
                  Retry
                </button>
              </div>
            )}
            {!isLoading && !isError && notifications.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-slate-500">You are all caught up.</p>
            )}
            <ul>
              {notifications.map((n) => (
                <li key={n._id}>
                  <button
                    type="button"
                    onClick={() => openNotification(n)}
                    className={clsx(
                      'flex w-full gap-3 px-4 py-3 text-left hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none',
                      !n.isRead && 'bg-blue-50/50',
                    )}
                  >
                    <span
                      className={clsx(
                        'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                        n.isRead ? 'bg-transparent' : 'bg-blue-600',
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-900">
                        {n.title}
                        {!n.isRead && <span className="sr-only"> (unread)</span>}
                      </span>
                      {n.body && (
                        <span className="mt-0.5 block truncate text-xs text-slate-500">
                          {n.body}
                        </span>
                      )}
                      <span className="mt-1 block text-xs text-slate-400">
                        {relativeTime(n.createdAt, now)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
