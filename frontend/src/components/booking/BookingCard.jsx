import { Link } from 'react-router-dom';
import { CalendarClock, ChevronRight, Zap } from 'lucide-react';
import { CategoryBadgeIcon } from '../../lib/categoryIcons.jsx';
import { formatFriendlyDateTime, relativeTime } from '../../lib/format.js';
import { Avatar } from '../ui/Avatar.jsx';
import { Badge } from '../ui/Badge.jsx';
import { StatusBadge } from './StatusBadge.jsx';

/** A booking row for lists. `booking` is a list row from /bookings/my or /bookings/technician/my. */
export function BookingCard({ booking, to, now, categoryIcon }) {
  const showProposal =
    booking.proposedSchedule && !['COMPLETED', 'CANCELLED'].includes(booking.status);
  const person = booking.technician ?? booking.customer;
  return (
    <Link
      to={to}
      className="group block rounded-2xl border border-slate-200/80 bg-white p-4 shadow-(--shadow-soft) transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-(--shadow-lift) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:p-5"
    >
      <div className="flex items-start gap-4">
        <CategoryBadgeIcon
          icon={categoryIcon}
          categoryKey={booking.category}
          className="hidden sm:inline-flex"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-semibold text-slate-500">
              {booking.bookingCode}
            </span>
            <StatusBadge status={booking.status} />
            {booking.urgency === 'URGENT' && (
              <Badge tone="red">
                <Zap className="h-3 w-3" aria-hidden /> Urgent
              </Badge>
            )}
          </div>
          <h3 className="mt-1.5 truncate text-base font-semibold text-slate-900 group-hover:text-blue-700">
            {booking.title}
          </h3>
          <p className="mt-0.5 text-sm text-slate-500">
            {booking.area || booking.addressText} · created {relativeTime(booking.createdAt, now)}
          </p>
          {showProposal && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-violet-50 px-2.5 py-1 text-sm text-violet-800">
              <CalendarClock className="h-4 w-4" aria-hidden />
              {formatFriendlyDateTime(booking.proposedSchedule.scheduledDate, now)} ·{' '}
              {booking.proposedSchedule.timeSlotLabel}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {person ? (
            <span className="flex items-center gap-2">
              <span className="hidden text-right text-sm font-medium text-slate-700 sm:block">
                {person.name}
              </span>
              <Avatar name={person.name} src={person.avatar} size="sm" />
            </span>
          ) : (
            <span className="text-xs text-slate-400">No technician yet</span>
          )}
          <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-blue-500" aria-hidden />
        </div>
      </div>
    </Link>
  );
}

export default BookingCard;
