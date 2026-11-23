import {
  Ban,
  CalendarCheck,
  CalendarClock,
  CalendarX,
  CheckCircle2,
  FilePlus2,
  MessageSquareReply,
  Navigation,
  Radar,
  Undo2,
  Wrench,
} from 'lucide-react';
import { ROLE_LABEL } from '../../lib/constants.js';
import { formatDateTime, formatFriendlyDateTime, formatMoney } from '../../lib/format.js';

const STATUS_EVENT = {
  REQUESTED: { label: 'Request created', icon: FilePlus2, color: 'text-slate-600 bg-slate-100' },
  SEARCHING_TECHNICIAN: {
    label: 'Searching for nearby technicians',
    icon: Radar,
    color: 'text-amber-700 bg-amber-100',
  },
  CONFIRMED_SCHEDULED: {
    label: 'Arrival time confirmed',
    icon: CalendarCheck,
    color: 'text-blue-700 bg-blue-100',
  },
  ON_THE_WAY: {
    label: 'Technician on the way',
    icon: Navigation,
    color: 'text-indigo-700 bg-indigo-100',
  },
  IN_PROGRESS: { label: 'Repair started', icon: Wrench, color: 'text-cyan-700 bg-cyan-100' },
  COMPLETED: { label: 'Job completed', icon: CheckCircle2, color: 'text-green-700 bg-green-100' },
  CANCELLED: { label: 'Booking cancelled', icon: Ban, color: 'text-red-700 bg-red-100' },
};

const RESPONSE_EVENT = {
  ACCEPT: {
    label: 'Customer accepted the time',
    icon: CalendarCheck,
    color: 'text-blue-700 bg-blue-100',
  },
  REQUEST_NEW_TIME: {
    label: 'Customer asked for another time',
    icon: MessageSquareReply,
    color: 'text-violet-700 bg-violet-100',
  },
  DECLINE_TECHNICIAN: {
    label: 'Customer chose another technician',
    icon: CalendarX,
    color: 'text-red-700 bg-red-100',
  },
};

/**
 * statusHistory and scheduleHistory merged, newest first. Proposals stand in for the
 * SCHEDULE_PROPOSED status entries, since they carry the time, note and fee.
 */
export function buildTimeline(booking) {
  const events = [];
  for (const [i, h] of (booking.statusHistory ?? []).entries()) {
    if (h.status === 'SCHEDULE_PROPOSED') continue;
    const meta = STATUS_EVENT[h.status] ?? {
      label: h.status,
      icon: FilePlus2,
      color: 'text-slate-600 bg-slate-100',
    };
    const releasedBack = h.status === 'SEARCHING_TECHNICIAN' && i > 1;
    events.push({
      key: `s-${i}`,
      at: h.timestamp,
      label: releasedBack ? 'Back to searching for technicians' : meta.label,
      icon: releasedBack ? Undo2 : meta.icon,
      color: meta.color,
      note: h.note,
      role: h.role,
    });
  }
  for (const [i, p] of (booking.scheduleHistory ?? []).entries()) {
    events.push({
      key: `p-${i}`,
      at: p.proposedAt,
      label: `Arrival time proposed (proposal ${p.round})`,
      icon: CalendarClock,
      color: 'text-violet-700 bg-violet-100',
      note: [
        `${formatFriendlyDateTime(p.scheduledDate)} · ${p.timeSlotLabel}`,
        p.estimatedFee !== undefined && p.estimatedFee !== null
          ? `estimate ${formatMoney(p.estimatedFee)}`
          : null,
        p.technicianNote || null,
      ]
        .filter(Boolean)
        .join(' — '),
      role: 'technician',
    });
    if (p.response && p.respondedAt) {
      const meta = RESPONSE_EVENT[p.response];
      events.push({
        key: `r-${i}`,
        at: p.respondedAt,
        label: meta?.label ?? p.response,
        icon: meta?.icon ?? MessageSquareReply,
        color: meta?.color ?? 'text-slate-600 bg-slate-100',
        note: p.responseNote,
        role: 'customer',
      });
    }
  }
  return events.sort((a, b) => new Date(b.at) - new Date(a.at));
}

export function StatusTimeline({ booking }) {
  const events = buildTimeline(booking);
  if (events.length === 0) return <p className="text-sm text-slate-500">No activity yet.</p>;
  return (
    <ol className="space-y-5">
      {events.map((e, i) => {
        const Icon = e.icon;
        return (
          <li key={e.key} className="relative flex gap-3">
            {i < events.length - 1 && (
              <span
                className="absolute left-4 top-9 h-[calc(100%-0.25rem)] w-px bg-slate-200"
                aria-hidden
              />
            )}
            <span
              className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${e.color}`}
            >
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="text-sm font-semibold text-slate-900">{e.label}</p>
              {e.note && <p className="mt-0.5 break-words text-sm text-slate-600">{e.note}</p>}
              <p className="mt-0.5 text-xs text-slate-400">
                {ROLE_LABEL[e.role] ?? e.role} · <time dateTime={e.at}>{formatDateTime(e.at)}</time>
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default StatusTimeline;
