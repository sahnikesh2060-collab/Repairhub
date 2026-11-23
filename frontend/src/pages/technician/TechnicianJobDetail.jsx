import { useEffect, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  MapPin,
  Navigation,
  Phone,
  Play,
  Undo2,
  XCircle,
} from 'lucide-react';
import * as bookingsApi from '../../api/bookings.api.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useBookingRoom } from '../../hooks/useBookingRoom.js';
import { useLiveLocationSharing } from '../../hooks/useLiveLocationSharing.js';
import { useNow } from '../../hooks/useNow.js';
import { useSocket } from '../../hooks/useSocket.js';
import { ACTIONS, TECHNICIAN_STAGES } from '../../lib/constants.js';
import { directionsUrl, fromPoint } from '../../lib/geo.js';
import {
  formatDateTime,
  formatFriendlyDateTime,
  formatMoney,
  relativeTime,
  secondsAgo,
} from '../../lib/format.js';
import { queryKeys } from '../../lib/queryKeys.js';
import { BookingTracker } from '../../components/booking/BookingTracker.jsx';
import { ChatPanel } from '../../components/booking/ChatPanel.jsx';
import { PhotoLightbox } from '../../components/booking/PhotoLightbox.jsx';
import { StatusBadge } from '../../components/booking/StatusBadge.jsx';
import { StatusTimeline } from '../../components/booking/StatusTimeline.jsx';
import {
  CompleteJobModal,
  ReleaseJobDialog,
} from '../../components/technician/JobActionDialogs.jsx';
import { ScheduleFormModal } from '../../components/technician/ScheduleFormModal.jsx';
import { Avatar } from '../../components/ui/Avatar.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';

export default function TechnicianJobDetail() {
  const { id } = useParams();
  const { profile } = useOutletContext();
  const { user } = useAuth();
  const { socket } = useSocket();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const now = useNow(30_000);
  const tick = useNow(1000);
  const key = queryKeys.booking(id);
  const [dialog, setDialog] = useState(null);

  const query = useQuery({ queryKey: key, queryFn: () => bookingsApi.getBooking(id) });
  const booking = query.data;
  const { typingUser, sendTyping } = useBookingRoom(id);
  const sharing = useLiveLocationSharing(id, booking?.status === 'ON_THE_WAY');

  // Leave the page when the customer or an admin cancels.
  useEffect(() => {
    if (!socket) return undefined;
    const onCancelled = (payload) => {
      if (payload.bookingId !== id) return;
      toast.error(`Booking ${payload.booking?.bookingCode ?? ''} was cancelled: ${payload.reason}`);
      queryClient.invalidateQueries({ queryKey: queryKeys.bookingsAll });
      navigate('/technician/jobs', { replace: true });
    };
    socket.on('booking_cancelled', onCancelled);
    return () => socket.off('booking_cancelled', onCancelled);
  }, [socket, id, navigate, queryClient]);

  const statusMutation = useMutation({
    mutationFn: (body) => bookingsApi.updateStatus(id, body),
    onSuccess: ({ booking: updated }, body) => {
      queryClient.setQueryData(key, updated);
      queryClient.invalidateQueries({ queryKey: queryKeys.bookingsAll });
      queryClient.invalidateQueries({ queryKey: queryKeys.earnings });
      setDialog(null);
      const copy = {
        ON_THE_WAY: 'Marked on the way. Your location is now shared with the customer.',
        IN_PROGRESS: 'Repair started. Location sharing stopped.',
        COMPLETED: 'Job completed. Well done!',
      };
      toast.success(copy[body.status]);
    },
    onError: (err) => toast.error(err.message),
  });

  const releaseMutation = useMutation({
    mutationFn: (reason) => bookingsApi.releaseBooking(id, { reason }),
    onSuccess: () => {
      toast.success('Job released. It went back to other nearby technicians.');
      queryClient.invalidateQueries({ queryKey: queryKeys.bookingsAll });
      queryClient.removeQueries({ queryKey: key });
      navigate('/technician/jobs', { replace: true });
    },
    onError: (err) => toast.error(err.message),
  });

  if (query.isLoading) {
    return (
      <div
        className="mx-auto max-w-6xl space-y-4 px-4 py-8 sm:px-6"
        role="status"
        aria-label="Loading job"
      >
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-28" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        {query.error.status === 404 ? (
          <EmptyState
            icon={XCircle}
            title="Job not available"
            description="It may have been taken by another technician, released, or declined by the customer."
            action={
              <Button as={Link} to="/technician">
                Back to nearby requests
              </Button>
            }
          />
        ) : (
          <ErrorState error={query.error} onRetry={query.refetch} />
        )}
      </div>
    );
  }

  const actions = booking.allowedActions ?? [];
  const has = (a) => actions.includes(a);
  const destination = fromPoint(booking.location);
  const proposal = booking.proposedSchedule;
  const lastProposal = booking.scheduleHistory?.[booking.scheduleHistory.length - 1];
  const customerNote =
    booking.scheduleStatus === 'RESCHEDULE_REQUESTED' ? lastProposal?.responseNote : undefined;
  const busy = statusMutation.isPending || releaseMutation.isPending;
  const finished = ['COMPLETED', 'CANCELLED'].includes(booking.status);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 pb-28 sm:px-6">
      <Link
        to="/technician/jobs"
        className="inline-flex items-center gap-1 rounded-md text-sm font-medium text-slate-600 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> My jobs
      </Link>
      <header className="mt-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-semibold text-slate-500">
            {booking.bookingCode}
          </span>
          <StatusBadge status={booking.status} />
        </div>
        <h1 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl">{booking.title}</h1>
        <p className="text-sm text-slate-500">
          {booking.category} · requested {relativeTime(booking.createdAt, now)}
          {booking.distanceKm !== undefined && ` · ${booking.distanceKm} km from you`}
        </p>
      </header>

      <Card className="mt-6">
        <BookingTracker booking={booking} labels={TECHNICIAN_STAGES} />
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {customerNote !== undefined && (
            <Card className="border-violet-200">
              <p className="font-semibold text-violet-900">The customer asked for another time</p>
              <p className="mt-1 text-sm text-violet-800">
                {customerNote ? `“${customerNote}”` : 'No note was added.'}
              </p>
            </Card>
          )}

          {proposal && !finished && (
            <Card>
              <CardHeader
                title={
                  <span className="inline-flex items-center gap-2">
                    <CalendarClock className="h-4 w-4 text-blue-600" aria-hidden />
                    {booking.status === 'SCHEDULE_PROPOSED'
                      ? 'Your proposed time'
                      : 'Confirmed arrival'}
                  </span>
                }
                description={
                  booking.scheduleStatus === 'PENDING'
                    ? 'Waiting for the customer to answer.'
                    : undefined
                }
              />
              <p className="text-2xl font-bold text-slate-900">
                {formatFriendlyDateTime(proposal.scheduledDate, now)}
              </p>
              <p className="text-sm text-slate-600">
                {proposal.timeSlotLabel} · proposal {proposal.round}
                {booking.estimatedCost !== undefined &&
                  booking.estimatedCost !== null &&
                  ` · estimate ${formatMoney(booking.estimatedCost)}`}
              </p>
            </Card>
          )}

          {booking.status === 'ON_THE_WAY' && (
            <Card className="border-indigo-200 bg-indigo-50/50">
              <p className="flex items-center gap-2 font-semibold text-indigo-900">
                <Navigation className="h-4 w-4" aria-hidden /> Sharing your live location
              </p>
              <p className="mt-1 text-sm text-indigo-800">
                {sharing.error ??
                  (sharing.lastSentAt
                    ? `Last sent ${secondsAgo(sharing.lastSentAt, tick)}. Updates every 15 seconds while this page is open.`
                    : 'Waiting for the first GPS fix…')}
              </p>
            </Card>
          )}

          {booking.status === 'COMPLETED' && (
            <Card>
              <p className="text-sm text-slate-500">Final cost</p>
              <p className="text-2xl font-bold text-slate-900">{formatMoney(booking.finalCost)}</p>
              {booking.review ? (
                <p className="mt-2 text-sm text-slate-700">
                  Customer rated {booking.review.rating}/5
                  {booking.review.comment && `: “${booking.review.comment}”`}
                </p>
              ) : (
                <p className="mt-2 text-sm text-slate-500">
                  Waiting for the customer&apos;s review.
                </p>
              )}
            </Card>
          )}

          {booking.technicianId && (
            <ChatPanel
              bookingId={booking._id}
              currentUserId={user._id}
              canSend={has(ACTIONS.CHAT)}
              readOnlyNote={
                finished ? 'This job is finished, so the chat is read-only.' : undefined
              }
              typingUser={typingUser}
              onTyping={sendTyping}
              now={now}
            />
          )}
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader title="Customer" />
            {booking.customer && (
              <div className="flex items-center gap-3">
                <Avatar name={booking.customer.name} src={booking.customer.avatar} />
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{booking.customer.name}</p>
                  {booking.customer.phone && (
                    <a
                      href={`tel:${booking.customer.phone}`}
                      className="inline-flex items-center gap-1 rounded-md text-sm font-semibold text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      <Phone className="h-4 w-4" aria-hidden /> {booking.customer.phone}
                    </a>
                  )}
                </div>
              </div>
            )}
            <div className="mt-4 flex gap-2 text-sm text-slate-700">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
              <div>
                <p>
                  {booking.location?.addressText ??
                    `${booking.area} (exact address after confirmation)`}
                </p>
                {destination && (
                  <a
                    href={directionsUrl(destination)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 rounded-md font-semibold text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    Open in Google Maps <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  </a>
                )}
              </div>
            </div>
          </Card>
          <Card>
            <CardHeader title="Problem" />
            <p className="whitespace-pre-wrap text-sm text-slate-700">{booking.description}</p>
            {booking.images?.length > 0 && (
              <div className="mt-3">
                <PhotoLightbox images={booking.images} title="Customer photos" />
              </div>
            )}
          </Card>
          {booking.statusHistory && (
            <Card>
              <CardHeader title="Activity" />
              <StatusTimeline booking={booking} />
            </Card>
          )}
          <p className="text-xs text-slate-400">Created {formatDateTime(booking.createdAt)}</p>
        </aside>
      </div>

      {/* Action bar: rendered ONLY from booking.allowedActions. */}
      {actions.some((a) => a !== ACTIONS.CHAT) && (
        <div className="fixed inset-x-0 bottom-0 z-[700] border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap justify-end gap-2">
            {has(ACTIONS.ACCEPT_AND_SCHEDULE) && (
              <Button icon={CalendarClock} onClick={() => setDialog('accept')}>
                Accept & propose time
              </Button>
            )}
            {has(ACTIONS.RELEASE) && (
              <Button
                variant="danger-outline"
                icon={Undo2}
                onClick={() => setDialog('release')}
                disabled={busy}
              >
                Release Job
              </Button>
            )}
            {has(ACTIONS.PROPOSE_SCHEDULE) && (
              <Button
                variant="secondary"
                icon={CalendarClock}
                onClick={() => setDialog('propose')}
                disabled={busy}
              >
                Propose New Time
              </Button>
            )}
            {has(ACTIONS.MARK_ON_THE_WAY) && (
              <Button
                icon={Navigation}
                loading={statusMutation.isPending}
                disabled={busy}
                onClick={() => statusMutation.mutate({ status: 'ON_THE_WAY' })}
              >
                Mark On The Way
              </Button>
            )}
            {has(ACTIONS.START_REPAIR) && (
              <Button
                icon={Play}
                loading={statusMutation.isPending}
                disabled={busy}
                onClick={() => statusMutation.mutate({ status: 'IN_PROGRESS' })}
              >
                Start Repair
              </Button>
            )}
            {has(ACTIONS.COMPLETE) && (
              <Button icon={CheckCircle2} onClick={() => setDialog('complete')} disabled={busy}>
                Complete Job
              </Button>
            )}
          </div>
        </div>
      )}

      <ScheduleFormModal
        open={dialog === 'accept' || dialog === 'propose'}
        onClose={() => setDialog(null)}
        bookingId={id}
        mode={dialog === 'accept' ? 'accept' : 'propose'}
        defaultFee={booking.estimatedCost ?? profile.visitFee}
        customerNote={customerNote}
        onTaken={() => navigate('/technician', { replace: true })}
      />
      <CompleteJobModal
        open={dialog === 'complete'}
        onClose={() => setDialog(null)}
        loading={statusMutation.isPending}
        defaultCost={booking.estimatedCost}
        onSubmit={({ finalCost, note }) =>
          statusMutation.mutate({ status: 'COMPLETED', finalCost, note })
        }
      />
      <ReleaseJobDialog
        open={dialog === 'release'}
        onClose={() => setDialog(null)}
        loading={releaseMutation.isPending}
        onConfirm={(reason) => releaseMutation.mutate(reason)}
      />
    </div>
  );
}
