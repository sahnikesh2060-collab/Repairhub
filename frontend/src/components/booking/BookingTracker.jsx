import clsx from 'clsx';
import { Check, XCircle } from 'lucide-react';
import { CUSTOMER_STAGES, ROLE_LABEL, STAGE_STATUSES } from '../../lib/constants.js';
import { formatDateTime, formatFriendlyDateTime } from '../../lib/format.js';

function stepTime(history, step) {
  const statuses = STAGE_STATUSES[step];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (statuses.includes(history[i].status)) return history[i].timestamp;
  }
  return null;
}

/**
 * The 6-step progress bar, driven only by the backend `stage` ({ stage, cancelled }).
 * Horizontal from md up, vertical on phones. `labels` lets other roles reword the steps.
 */
export function BookingTracker({ booking, labels = CUSTOMER_STAGES }) {
  const { stage = 1, cancelled = false } = booking.stage ?? {};
  const history = booking.statusHistory ?? [];
  const completed = booking.status === 'COMPLETED';

  return (
    <div>
      {cancelled && (
        <div
          className="mb-4 flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4"
          role="status"
        >
          <XCircle className="h-5 w-5 shrink-0 text-red-600" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-red-900">This booking was cancelled</p>
            {booking.cancellation && (
              <p className="mt-0.5 text-sm text-red-800">
                {booking.cancellation.reason ? `“${booking.cancellation.reason}” · ` : ''}
                by {ROLE_LABEL[booking.cancellation.role]?.toLowerCase() ?? 'someone'},{' '}
                {formatDateTime(booking.cancellation.at)}
              </p>
            )}
          </div>
        </div>
      )}
      <ol
        className="relative flex flex-col gap-4 md:flex-row md:gap-0"
        aria-label={`Progress: step ${stage} of 6${cancelled ? ', cancelled' : ''}`}
      >
        {labels.map((s, i) => {
          const done = s.stage < stage || (completed && s.stage === 6);
          const current = !done && s.stage === stage;
          const stopped = cancelled && s.stage === stage;
          const at = done || current ? stepTime(history, s.stage) : null;
          const last = i === labels.length - 1;
          return (
            <li
              key={s.stage}
              className="relative flex gap-3 md:flex-1 md:flex-col md:items-center md:text-center"
              aria-current={current && !cancelled ? 'step' : undefined}
            >
              {!last && (
                <span
                  aria-hidden
                  className={clsx(
                    'absolute left-4 top-9 h-[calc(100%-1rem)] w-0.5 md:left-[calc(50%+1.25rem)] md:top-4 md:h-0.5 md:w-[calc(100%-2.5rem)]',
                    done ? 'bg-blue-600' : 'bg-slate-200',
                  )}
                />
              )}
              <span
                className={clsx(
                  'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ring-4 ring-white',
                  done && 'bg-blue-600 text-white',
                  current &&
                    !stopped &&
                    'bg-white text-blue-700 ring-blue-100 outline outline-2 outline-blue-600',
                  stopped && 'bg-red-600 text-white',
                  !done && !current && 'bg-slate-100 text-slate-400',
                )}
              >
                {current && !stopped && (
                  <span
                    className="absolute inset-0 animate-ping rounded-full bg-blue-400/40"
                    aria-hidden
                  />
                )}
                {done ? (
                  <Check className="h-4 w-4" aria-hidden />
                ) : stopped ? (
                  <XCircle className="h-4 w-4" aria-hidden />
                ) : (
                  s.stage
                )}
              </span>
              <span className="min-w-0 pb-1 md:mt-2 md:px-1">
                <span
                  className={clsx(
                    'block text-sm font-semibold',
                    done || current ? 'text-slate-900' : 'text-slate-400',
                  )}
                >
                  {s.label}
                  <span className="sr-only">
                    {done
                      ? ' (done)'
                      : current
                        ? stopped
                          ? ' (cancelled here)'
                          : ' (current step)'
                        : ' (upcoming)'}
                  </span>
                </span>
                <span className="block text-xs text-slate-500">{s.detail}</span>
                {at && (
                  <time dateTime={at} className="mt-0.5 block text-xs text-slate-400">
                    {formatFriendlyDateTime(at)}
                  </time>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default BookingTracker;
