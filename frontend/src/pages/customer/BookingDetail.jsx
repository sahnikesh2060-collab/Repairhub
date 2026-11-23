import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  CalendarCheck,
  Clock,
  Hourglass,
  MapPin,
  Radar,
  RefreshCw,
  Search,
  UserX,
  Wallet,
  XCircle,
  Zap,
} from 'lucide-react';
import * as bookingsApi from '../../api/bookings.api.js';
import * as categoriesApi from '../../api/categories.api.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useBookingRoom } from '../../hooks/useBookingRoom.js';
import { useNow } from '../../hooks/useNow.js';
import { CategoryBadgeIcon } from '../../lib/categoryIcons.jsx';
import { ACTIONS } from '../../lib/constants.js';
import {
  formatDateTime,
  formatFriendlyDateTime,
  formatMoney,
  formatTime,
  pluralize,
  relativeTime,
} from '../../lib/format.js';
import { queryKeys } from '../../lib/queryKeys.js';
import { BookingTracker } from '../../components/booking/BookingTracker.jsx';
import { CancelBookingDialog } from '../../components/booking/CancelBookingDialog.jsx';
import { ChatPanel } from '../../components/booking/ChatPanel.jsx';
import { LiveLocationMap } from '../../components/booking/LiveLocationMap.jsx';
import { PhotoLightbox } from '../../components/booking/PhotoLightbox.jsx';
import { RequestNewTimeDialog } from '../../components/booking/RequestNewTimeDialog.jsx';
import { ReviewForm } from '../../components/booking/ReviewForm.jsx';
import { ScheduleProposalCard } from '../../components/booking/ScheduleProposalCard.jsx';
import { StatusBadge } from '../../components/booking/StatusBadge.jsx';
import { StatusTimeline } from '../../components/booking/StatusTimeline.jsx';
import { TechnicianSummaryCard } from '../../components/booking/TechnicianSummaryCard.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.jsx';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { StarRating } from '../../components/ui/StarRating.jsx';

// Optimistic patches applied while a schedule response is in flight (rolled back on error).
const OPTIMISTIC = {
  [ACTIONS.ACCEPT_SCHEDULE]: () => ({
    status: 'CONFIRMED_SCHEDULED',
    scheduleStatus: 'ACCEPTED',
    stage: { stage: 3, cancelled: false },
  }),
  [ACTIONS.REQUEST_NEW_TIME]: () => ({ scheduleStatus: 'RESCHEDULE_REQUESTED' }),
  [ACTIONS.DECLINE_TECHNICIAN]: () => ({
    status: 'SEARCHING_TECHNICIAN',
    scheduleStatus: 'NONE',
    stage: { stage: 1, cancelled: false },
  }),
};
const API_ACTION = {
  [ACTIONS.ACCEPT_SCHEDULE]: 'ACCEPT',
  [ACTIONS.REQUEST_NEW_TIME]: 'REQUEST_NEW_TIME',
  [ACTIONS.DECLINE_TECHNICIAN]: 'DECLINE_TECHNICIAN',
};

function DetailSkeleton() {
  return (
    <div
      className="mx-auto max-w-6xl space-y-4 px-4 py-8 sm:px-6"
      role="status"
      aria-label="Loading booking"
    >
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-28" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-64 lg:col-span-2" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}

function SearchingPanel({ booking, canRebroadcast, onRebroadcast, rebroadcasting, retryAt, tick }) {
  const notified = booking.notifiedTechnicians?.length ?? 0;
  const waitSeconds = retryAt ? Math.max(0, Math.ceil((retryAt - tick.getTime()) / 1000)) : 0;
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col items-center gap-5 py-4 text-center sm:flex-row sm:text-left">
        <span className="relative flex h-20 w-20 shrink-0 items-center justify-center" aria-hidden>
          <span className="rh-radar absolute inset-0 rounded-full bg-amber-300/50" />
          <span className="rh-radar rh-radar-delay absolute inset-0 rounded-full bg-amber-300/50" />
          <span className="relative rounded-full bg-amber-500 p-4 text-white">
            <Radar className="h-7 w-7" />
          </span>
        </span>
        <div className="flex-1">
          <p className="text-lg font-semibold text-slate-900">
            {notified > 0
              ? `Notified ${pluralize(notified, 'technician')} nearby`
              : 'Looking for technicians nearby'}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {notified > 0
              ? 'The first one to accept will propose an arrival time. You will be notified instantly.'
              : 'No technician is available in range right now. We will keep this request open.'}
          </p>
        </div>
        {canRebroadcast && (
          <div className="flex flex-col items-center gap-1">
            <Button
              variant="secondary"
              icon={Search}
              onClick={onRebroadcast}
              loading={rebroadcasting}
              disabled={waitSeconds > 0}
            >
              Search again
            </Button>
            {waitSeconds > 0 && (
              <span className="text-xs text-slate-500" aria-live="polite">
                Available again in {waitSeconds} s
              </span>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

export default function BookingDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const now = useNow(30_000);
  const tick = useNow(1000);
  const key = queryKeys.booking(id);
  const [dialog, setDialog] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [retryAt, setRetryAt] = useState(null);

  const query = useQuery({ queryKey: key, queryFn: () => bookingsApi.getBooking(id) });
  const categories = useQuery({
    queryKey: queryKeys.categories,
    queryFn: categoriesApi.listCategories,
    staleTime: 5 * 60_000,
  });
  const { typingUser, sendTyping } = useBookingRoom(id);

  const respond = useMutation({
    mutationFn: ({ action, note }) =>
      bookingsApi.respondSchedule(id, { action: API_ACTION[action], note: note || undefined }),
    onMutate: async ({ action }) => {
      setPendingAction(action);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData(key);
      queryClient.setQueryData(key, (old) => (old ? { ...old, ...OPTIMISTIC[action](old) } : old));
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      toast.error(err.message);
      queryClient.invalidateQueries({ queryKey: key });
    },
    onSuccess: (result, { action }) => {
      queryClient.setQueryData(key, result.booking);
      queryClient.invalidateQueries({ queryKey: queryKeys.bookingsAll });
      setDialog(null);
      if (action === ACTIONS.ACCEPT_SCHEDULE) toast.success('Time confirmed. See you then!');
      if (action === ACTIONS.REQUEST_NEW_TIME) toast.success('We asked for another time.');
      if (action === ACTIONS.DECLINE_TECHNICIAN) {
        toast.success(
          result.matchedCount > 0
            ? `Sent back to ${pluralize(result.matchedCount, 'nearby technician')}`
            : 'Back to searching. We will keep looking.',
        );
      }
    },
    onSettled: () => setPendingAction(null),
  });

  const rebroadcast = useMutation({
    mutationFn: () => bookingsApi.rebroadcast(id),
    onSuccess: (r) => {
      setRetryAt(Date.now() + 2 * 60_000);
      toast.success(
        r.notifiedCount > 0
          ? `Notified ${pluralize(r.notifiedCount, 'more technician')}`
          : 'No new technicians in range yet. We will keep looking.',
      );
      queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (err) => {
      if (err.code === 'RATE_LIMITED' && err.details?.retryAfterSeconds) {
        setRetryAt(Date.now() + err.details.retryAfterSeconds * 1000);
        toast.error(`You can search again in ${err.details.retryAfterSeconds} seconds.`);
      } else {
        toast.error(err.message);
      }
    },
  });

  if (query.isLoading) return <DetailSkeleton />;
  if (query.isError) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        {query.error.status === 404 ? (
          <EmptyState
            icon={XCircle}
            title="Booking not found"
            description="It may have been removed, or it belongs to another account."
            action={
              <Button as={Link} to="/customer">
                Back to my bookings
              </Button>
            }
          />
        ) : (
          <ErrorState error={query.error} onRetry={query.refetch} />
        )}
      </div>
    );
  }

  const booking = query.data;
  const actions = booking.allowedActions ?? [];
  const category = categories.data?.find((c) => c.key === booking.category);
  const proposal = booking.proposedSchedule;
  const [lng, lat] = booking.location?.coordinates ?? [];
  const destination = Number.isFinite(lat) ? { lng, lat } : null;
  const lastResponse = booking.scheduleHistory?.[booking.scheduleHistory.length - 1];
  const showProposal =
    booking.status === 'SCHEDULE_PROPOSED' &&
    (booking.scheduleStatus === 'PENDING' || Boolean(pendingAction));
  const waitingForReproposal =
    !pendingAction &&
    booking.status === 'SCHEDULE_PROPOSED' &&
    booking.scheduleStatus === 'RESCHEDULE_REQUESTED';
  const confirmedPhase = ['CONFIRMED_SCHEDULED', 'ON_THE_WAY', 'IN_PROGRESS'].includes(
    booking.status,
  );
  const finished = ['COMPLETED', 'CANCELLED'].includes(booking.status);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Link
        to="/customer"
        className="inline-flex items-center gap-1 rounded-md text-sm font-medium text-slate-600 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> My bookings
      </Link>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <CategoryBadgeIcon icon={category?.icon} categoryKey={booking.category} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-semibold text-slate-500">
                {booking.bookingCode}
              </span>
              <StatusBadge status={booking.status} />
              {booking.urgency === 'URGENT' && (
                <Badge tone="red">
                  <Zap className="h-3 w-3" aria-hidden /> Urgent
                </Badge>
              )}
            </div>
            <h1 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl">{booking.title}</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              {category?.name ?? booking.category} · created{' '}
              <time dateTime={booking.createdAt} title={formatDateTime(booking.createdAt)}>
                {relativeTime(booking.createdAt, now)}
              </time>
            </p>
          </div>
        </div>
        {actions.includes(ACTIONS.CANCEL) && (
          <Button variant="danger-outline" icon={XCircle} onClick={() => setDialog('cancel')}>
            Cancel booking
          </Button>
        )}
      </header>

      <Card className="mt-6">
        <BookingTracker booking={booking} />
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {booking.status === 'SEARCHING_TECHNICIAN' && !pendingAction && (
            <SearchingPanel
              booking={booking}
              canRebroadcast={actions.includes(ACTIONS.REBROADCAST)}
              onRebroadcast={() => rebroadcast.mutate()}
              rebroadcasting={rebroadcast.isPending}
              retryAt={retryAt}
              tick={tick}
            />
          )}

          {showProposal && (
            <ScheduleProposalCard
              booking={booking}
              now={now}
              pending={pendingAction}
              onAccept={() => respond.mutate({ action: ACTIONS.ACCEPT_SCHEDULE })}
              onRequestNewTime={() => setDialog('newTime')}
              onDecline={() => setDialog('decline')}
            />
          )}

          {waitingForReproposal && (
            <Card className="border-violet-200">
              <div className="flex gap-3">
                <Hourglass className="mt-0.5 h-5 w-5 shrink-0 text-violet-600" aria-hidden />
                <div>
                  <p className="font-semibold text-slate-900">
                    Waiting for {booking.technician?.name ?? 'the technician'} to propose a new time
                  </p>
                  {lastResponse?.responseNote && (
                    <p className="mt-1 text-sm text-slate-600">
                      Your note: “{lastResponse.responseNote}”
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-4">
                <TechnicianSummaryCard technician={booking.technician} />
              </div>
              {actions.includes(ACTIONS.DECLINE_TECHNICIAN) && (
                <Button
                  variant="danger-outline"
                  icon={UserX}
                  className="mt-4"
                  onClick={() => setDialog('decline')}
                >
                  Choose Another Technician
                </Button>
              )}
            </Card>
          )}

          {confirmedPhase && proposal && (
            <Card>
              <CardHeader
                title={
                  <span className="inline-flex items-center gap-2">
                    <CalendarCheck className="h-4 w-4 text-blue-600" aria-hidden /> Confirmed
                    arrival
                  </span>
                }
              />
              <p className="text-2xl font-bold text-slate-900">
                {formatFriendlyDateTime(proposal.scheduledDate, now)}
              </p>
              <p className="text-sm text-slate-600">
                {proposal.timeSlotLabel}
                {booking.estimatedCost !== undefined &&
                  booking.estimatedCost !== null &&
                  ` · estimate ${formatMoney(booking.estimatedCost)}`}
              </p>
              <div className="mt-4">
                <TechnicianSummaryCard technician={booking.technician} />
              </div>
            </Card>
          )}

          {booking.status === 'ON_THE_WAY' && (
            <LiveLocationMap
              destination={destination}
              liveLocation={booking.liveLocation}
              technicianName={booking.technician?.name}
            />
          )}

          {booking.status === 'COMPLETED' && (
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="rounded-xl bg-green-50 p-3 text-green-700">
                    <Wallet className="h-6 w-6" aria-hidden />
                  </span>
                  <div>
                    <p className="text-sm text-slate-500">Final cost</p>
                    <p className="text-2xl font-bold text-slate-900">
                      {formatMoney(booking.finalCost)}
                    </p>
                  </div>
                </div>
                {booking.completedAt && (
                  <p className="text-sm text-slate-500">
                    Completed {formatDateTime(booking.completedAt)}
                  </p>
                )}
              </div>
            </Card>
          )}

          {actions.includes(ACTIONS.REVIEW) && (
            <ReviewForm bookingId={booking._id} technicianName={booking.technician?.name} />
          )}
          {booking.review && (
            <Card>
              <CardHeader title="Your review" />
              <StarRating value={booking.review.rating} size="md" showValue />
              {booking.review.comment && (
                <p className="mt-2 text-sm text-slate-700">{booking.review.comment}</p>
              )}
              <p className="mt-2 text-xs text-slate-400">
                {formatDateTime(booking.review.createdAt)}
              </p>
            </Card>
          )}

          {booking.technician && (
            <ChatPanel
              bookingId={booking._id}
              currentUserId={user._id}
              canSend={actions.includes(ACTIONS.CHAT)}
              readOnlyNote={
                finished
                  ? `This booking is ${booking.status === 'COMPLETED' ? 'completed' : 'cancelled'}, so the chat is read-only.`
                  : undefined
              }
              typingUser={typingUser}
              onTyping={sendTyping}
              now={now}
            />
          )}
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader title="Details" />
            <p className="whitespace-pre-wrap text-sm text-slate-700">{booking.description}</p>
            {booking.images?.length > 0 && (
              <div className="mt-4">
                <PhotoLightbox images={booking.images} title="Your photos" />
              </div>
            )}
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex gap-2">
                <dt className="sr-only">Address</dt>
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                <dd className="text-slate-700">{booking.location?.addressText}</dd>
              </div>
              {booking.preferredCustomerWindow?.from && (
                <div className="flex gap-2">
                  <dt className="sr-only">Preferred time</dt>
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                  <dd className="text-slate-700">
                    Preferred {formatFriendlyDateTime(booking.preferredCustomerWindow.from, now)}
                    {booking.preferredCustomerWindow.to &&
                      ` – ${formatTime(booking.preferredCustomerWindow.to)}`}
                    {booking.preferredCustomerWindow.note &&
                      ` · ${booking.preferredCustomerWindow.note}`}
                  </dd>
                </div>
              )}
            </dl>
          </Card>
          <Card>
            <CardHeader
              title="Activity"
              actions={
                <button
                  type="button"
                  onClick={() => query.refetch()}
                  className="rounded-md p-1 text-slate-400 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  aria-label="Refresh booking"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`}
                    aria-hidden
                  />
                </button>
              }
            />
            <StatusTimeline booking={booking} />
          </Card>
        </aside>
      </div>

      <CancelBookingDialog
        open={dialog === 'cancel'}
        onClose={() => setDialog(null)}
        bookingId={booking._id}
        hasTechnician={Boolean(booking.technician)}
      />
      <RequestNewTimeDialog
        open={dialog === 'newTime'}
        onClose={() => setDialog(null)}
        loading={pendingAction === ACTIONS.REQUEST_NEW_TIME}
        technicianName={booking.technician?.name}
        onSubmit={(note) => respond.mutate({ action: ACTIONS.REQUEST_NEW_TIME, note })}
      />
      <ConfirmDialog
        open={dialog === 'decline'}
        onClose={() => setDialog(null)}
        title="Choose another technician?"
        description="This job goes back to other nearby technicians, and this technician will not see it again."
        confirmLabel="Choose another technician"
        cancelLabel="Keep this technician"
        loading={pendingAction === ACTIONS.DECLINE_TECHNICIAN}
        onConfirm={() => respond.mutate({ action: ACTIONS.DECLINE_TECHNICIAN })}
      >
        <p className="text-sm text-slate-600">
          You will be notified as soon as someone else accepts. You cannot undo this.
        </p>
      </ConfirmDialog>
    </div>
  );
}
