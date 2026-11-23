import { CalendarClock, Check, RefreshCw, UserX } from 'lucide-react';
import { ACTIONS, MAX_PROPOSAL_ROUNDS } from '../../lib/constants.js';
import { formatFriendlyDateTime, formatMoney } from '../../lib/format.js';
import { Button } from '../ui/Button.jsx';
import { Card } from '../ui/Card.jsx';
import { TechnicianSummaryCard } from './TechnicianSummaryCard.jsx';

/**
 * The pending proposal. Buttons are rendered only for actions present in
 * booking.allowedActions; `pending` names the action whose request is running.
 */
export function ScheduleProposalCard({
  booking,
  onAccept,
  onRequestNewTime,
  onDecline,
  pending,
  now,
}) {
  const proposal = booking.proposedSchedule;
  if (!proposal) return null;
  const actions = booking.allowedActions ?? [];
  const busy = Boolean(pending);

  return (
    <Card className="border-violet-200 ring-1 ring-violet-100">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-violet-700">
            <CalendarClock className="h-4 w-4" aria-hidden />
            Proposed arrival time
          </p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {formatFriendlyDateTime(proposal.scheduledDate, now)}
          </p>
          <p className="mt-1 text-base text-slate-600">{proposal.timeSlotLabel}</p>
        </div>
        <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
          Proposal {proposal.round} of {MAX_PROPOSAL_ROUNDS}
        </span>
      </div>

      {(proposal.technicianNote || proposal.estimatedFee !== undefined) && (
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          {proposal.technicianNote && (
            <div className="rounded-lg bg-slate-50 p-3">
              <dt className="text-xs font-medium text-slate-500">Note from the technician</dt>
              <dd className="mt-0.5 text-sm text-slate-800">{proposal.technicianNote}</dd>
            </div>
          )}
          {proposal.estimatedFee !== undefined && proposal.estimatedFee !== null && (
            <div className="rounded-lg bg-slate-50 p-3">
              <dt className="text-xs font-medium text-slate-500">Estimated fee</dt>
              <dd className="mt-0.5 text-sm font-semibold text-slate-900">
                {formatMoney(proposal.estimatedFee)}
              </dd>
            </div>
          )}
        </dl>
      )}

      <div className="mt-4">
        <TechnicianSummaryCard technician={booking.technician} />
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {actions.includes(ACTIONS.ACCEPT_SCHEDULE) && (
          <Button
            size="lg"
            icon={Check}
            onClick={onAccept}
            loading={pending === ACTIONS.ACCEPT_SCHEDULE}
            disabled={busy}
          >
            Accept Time
          </Button>
        )}
        {actions.includes(ACTIONS.REQUEST_NEW_TIME) && (
          <Button
            size="lg"
            variant="secondary"
            icon={RefreshCw}
            onClick={onRequestNewTime}
            loading={pending === ACTIONS.REQUEST_NEW_TIME}
            disabled={busy}
          >
            Request New Time
          </Button>
        )}
        {actions.includes(ACTIONS.DECLINE_TECHNICIAN) && (
          <Button
            size="lg"
            variant="danger-outline"
            icon={UserX}
            onClick={onDecline}
            loading={pending === ACTIONS.DECLINE_TECHNICIAN}
            disabled={busy}
          >
            Choose Another Technician
          </Button>
        )}
      </div>
      {!actions.includes(ACTIONS.REQUEST_NEW_TIME) && actions.includes(ACTIONS.ACCEPT_SCHEDULE) && (
        <p className="mt-3 text-xs text-slate-500">
          This was the last proposal round: accept this time or choose another technician.
        </p>
      )}
    </Card>
  );
}

export default ScheduleProposalCard;
