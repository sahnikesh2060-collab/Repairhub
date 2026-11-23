import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addDays,
  addHours,
  addMinutes,
  format,
  isSameDay,
  setHours,
  setMinutes,
  startOfHour,
} from 'date-fns';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { CalendarClock, Clock } from 'lucide-react';
import * as bookingsApi from '../../api/bookings.api.js';
import { queryKeys } from '../../lib/queryKeys.js';
import { formatFriendlyDateTime, formatMoney, formatTime } from '../../lib/format.js';
import { PhotoLightbox } from '../booking/PhotoLightbox.jsx';
import { Button } from '../ui/Button.jsx';
import { Input } from '../ui/Input.jsx';
import { Modal } from '../ui/Modal.jsx';
import { Skeleton } from '../ui/Skeleton.jsx';
import { Textarea } from '../ui/Textarea.jsx';

const MIN_LEAD_MS = 15 * 60_000;
const MAX_LEAD_MS = 14 * 24 * 60 * 60_000;

const toDateInput = (d) => format(d, 'yyyy-MM-dd');
const toTimeInput = (d) => format(d, 'HH:mm');

function dayWord(d, now) {
  if (isSameDay(d, now)) return 'Today';
  if (isSameDay(d, addDays(now, 1))) return 'Tomorrow';
  return format(d, 'EEE d MMM');
}

/** "Today 3:30-4:30 PM" for a one-hour slot starting at `start`. */
export function slotLabel(start, now = new Date()) {
  const end = addHours(start, 1);
  const sameHalf = format(start, 'a') === format(end, 'a');
  const from =
    format(start, start.getMinutes() ? 'h:mm' : 'h') + (sameHalf ? '' : ` ${format(start, 'a')}`);
  const to = format(end, end.getMinutes() ? 'h:mm a' : 'h a');
  return `${dayWord(start, now)} ${from}-${to}`;
}

/** Quick picks: in 1 hour, the next whole-hour slot today, tomorrow 10-11 AM. */
function quickSlots(now) {
  const slots = [];
  const inHour = addMinutes(now, 60);
  inHour.setMinutes(Math.ceil(inHour.getMinutes() / 5) * 5, 0, 0);
  slots.push({ id: 'hour', label: 'In 1 hour', start: inHour });
  const nextHour = startOfHour(addMinutes(now, 90));
  if (isSameDay(nextHour, now) && nextHour.getHours() <= 19) {
    slots.push({ id: 'today', label: slotLabel(nextHour, now), start: nextHour });
  }
  const tomorrow = setMinutes(setHours(addDays(now, 1), 10), 0);
  tomorrow.setSeconds(0, 0);
  slots.push({ id: 'tomorrow', label: 'Tomorrow 10-11 AM', start: tomorrow });
  return slots;
}

/**
 * Accept-and-schedule (mode "accept") or propose a new time (mode "propose").
 * On 409 ALREADY_TAKEN the caller's onTaken removes the request card.
 */
export function ScheduleFormModal({
  open,
  onClose,
  bookingId,
  mode = 'accept',
  defaultFee,
  customerNote,
  onDone,
  onTaken,
}) {
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => new Date());
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [label, setLabel] = useState('');
  const [labelEdited, setLabelEdited] = useState(false);
  const [note, setNote] = useState('');
  const [fee, setFee] = useState('');
  const [error, setError] = useState('');

  const detail = useQuery({
    queryKey: queryKeys.booking(bookingId),
    queryFn: () => bookingsApi.getBooking(bookingId),
    enabled: open && Boolean(bookingId),
  });

  useEffect(() => {
    if (!open) return;
    setNow(new Date());
    setDate('');
    setTime('');
    setLabel('');
    setLabelEdited(false);
    setNote('');
    setFee(defaultFee !== undefined && defaultFee !== null ? String(defaultFee) : '');
    setError('');
  }, [open, defaultFee]);

  const slots = useMemo(() => quickSlots(now), [now]);
  const start = date && time ? new Date(`${date}T${time}`) : null;

  useEffect(() => {
    if (start && !labelEdited) setLabel(slotLabel(start, new Date()));
  }, [date, time]); // eslint-disable-line

  const pick = (slot) => {
    setDate(toDateInput(slot.start));
    setTime(toTimeInput(slot.start));
    setLabel(slot.id === 'hour' ? `In about 1 hour (${formatTime(slot.start)})` : slot.label);
    setLabelEdited(true);
    setError('');
  };

  const mutation = useMutation({
    mutationFn: (body) =>
      mode === 'accept'
        ? bookingsApi.acceptAndSchedule(bookingId, body)
        : bookingsApi.proposeSchedule(bookingId, body),
    onSuccess: ({ booking }) => {
      queryClient.setQueryData(queryKeys.booking(bookingId), booking);
      queryClient.invalidateQueries({ queryKey: queryKeys.bookingsAll });
      queryClient.invalidateQueries({ queryKey: queryKeys.nearbyRequests });
      toast.success(
        mode === 'accept'
          ? 'Job accepted. Time sent to the customer.'
          : 'New time sent to the customer.',
      );
      onDone?.(booking);
      onClose();
    },
    onError: (err) => {
      if (err.code === 'ALREADY_TAKEN') {
        toast.error('Another technician took this job');
        onTaken?.(bookingId);
        onClose();
        return;
      }
      if (err.status === 404) {
        toast.error('This request is no longer available');
        onTaken?.(bookingId);
        onClose();
        return;
      }
      setError(err.details?.[0]?.message ?? err.message);
    },
  });

  const submit = (e) => {
    e.preventDefault();
    if (!start || Number.isNaN(start.getTime())) return setError('Pick a date and time.');
    const lead = start.getTime() - Date.now();
    if (lead < MIN_LEAD_MS) return setError('Choose a time at least 15 minutes from now.');
    if (lead > MAX_LEAD_MS) return setError('Choose a time within the next 14 days.');
    if (!label.trim()) return setError('Add a short time slot label, e.g. "Today 3-4 PM".');
    if (label.trim().length > 60) return setError('The slot label can be at most 60 characters.');
    const feeNumber = fee === '' ? undefined : Number(fee);
    if (feeNumber !== undefined && (!Number.isInteger(feeNumber) || feeNumber < 0)) {
      return setError('The fee must be a whole number of rupees.');
    }
    if (note.length > 500) return setError('The note can be at most 500 characters.');
    setError('');
    mutation.mutate({
      scheduledDate: start.toISOString(),
      timeSlotLabel: label.trim(),
      technicianNote: note.trim() || undefined,
      estimatedFee: feeNumber,
    });
    return undefined;
  };

  const b = detail.data;
  const prefWindow = b?.preferredCustomerWindow;

  return (
    <Modal
      open={open}
      onClose={mutation.isPending ? () => {} : onClose}
      title={mode === 'accept' ? 'Accept and propose a time' : 'Propose a new time'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={mutation.isPending} icon={CalendarClock}>
            {mode === 'accept' ? 'Accept & send time' : 'Send new time'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {mode === 'accept' && (
          <section aria-label="Request details" className="space-y-3">
            {detail.isLoading && <Skeleton className="h-24" />}
            {detail.isError && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                {detail.error.status === 404
                  ? 'This request is no longer available.'
                  : detail.error.message}
              </p>
            )}
            {b && (
              <>
                <div>
                  <p className="font-semibold text-slate-900">{b.title}</p>
                  <p className="text-sm text-slate-500">
                    {b.area}
                    {b.distanceKm !== undefined && ` · ${b.distanceKm} km away`}
                  </p>
                </div>
                <p className="whitespace-pre-wrap text-sm text-slate-700">{b.description}</p>
                {b.images?.length > 0 && (
                  <PhotoLightbox images={b.images} title="Customer photos" />
                )}
              </>
            )}
            {prefWindow?.from && (
              <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <Clock className="h-4 w-4 shrink-0" aria-hidden />
                Customer prefers {formatFriendlyDateTime(prefWindow.from)}
                {prefWindow.to && ` – ${formatTime(prefWindow.to)}`}
                {prefWindow.note && ` · ${prefWindow.note}`}
              </p>
            )}
          </section>
        )}

        {customerNote && (
          <p className="rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet-900">
            Customer&apos;s note: “{customerNote}”
          </p>
        )}

        <form onSubmit={submit} className="space-y-4" noValidate>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-slate-700">Quick pick</legend>
            <div className="flex flex-wrap gap-2">
              {slots.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => pick(s)}
                  className={clsx(
                    'rounded-full border px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                    start && start.getTime() === s.start.getTime()
                      ? 'border-blue-500 bg-blue-50 text-blue-800'
                      : 'border-slate-300 text-slate-700 hover:border-slate-400',
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Date"
              type="date"
              required
              min={toDateInput(now)}
              max={toDateInput(addDays(now, 14))}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <Input
              label="Arrival time"
              type="time"
              required
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
          <Input
            label="Time slot shown to the customer"
            required
            maxLength={60}
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
              setLabelEdited(true);
            }}
            hint={
              start
                ? `Arrival: ${formatFriendlyDateTime(start)}`
                : 'Filled in from the date and time'
            }
          />
          <Textarea
            label="Note for the customer (optional)"
            rows={2}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. I will bring a gas refill kit"
            counter={{ value: note.length, max: 500 }}
          />
          <Input
            label="Estimated fee (NPR)"
            type="number"
            min={0}
            inputMode="numeric"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            hint={
              defaultFee !== undefined ? `Your visit fee is ${formatMoney(defaultFee)}` : undefined
            }
          />
          {error && (
            <p
              className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
              role="alert"
            >
              {error}
            </p>
          )}
        </form>
      </div>
    </Modal>
  );
}

export default ScheduleFormModal;
