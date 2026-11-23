import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import * as bookingsApi from '../../api/bookings.api.js';
import { queryKeys } from '../../lib/queryKeys.js';
import { ConfirmDialog } from '../ui/ConfirmDialog.jsx';
import { Textarea } from '../ui/Textarea.jsx';

// Mirrors the backend: reason 5-300 characters.
const schema = z.object({
  reason: z
    .string()
    .trim()
    .min(5, 'Please give a reason (at least 5 characters)')
    .max(300, 'Keep it under 300 characters'),
});

export function CancelBookingDialog({ open, onClose, bookingId, hasTechnician, onCancelled }) {
  const queryClient = useQueryClient();
  const { register, handleSubmit, reset, watch, formState } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { reason: '' },
  });
  useEffect(() => {
    if (open) reset({ reason: '' });
  }, [open, reset]);

  const mutation = useMutation({
    mutationFn: ({ reason }) => bookingsApi.cancelBooking(bookingId, { reason }),
    onSuccess: ({ booking }) => {
      queryClient.setQueryData(queryKeys.booking(bookingId), booking);
      queryClient.invalidateQueries({ queryKey: queryKeys.bookingsAll });
      toast.success('Booking cancelled');
      onCancelled?.(booking);
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const reason = watch('reason') ?? '';
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      title="Cancel this booking?"
      description={
        hasTechnician
          ? 'The technician will be told straight away.'
          : 'Nearby technicians will stop seeing this request.'
      }
      confirmLabel="Cancel booking"
      cancelLabel="Keep booking"
      loading={mutation.isPending}
      onConfirm={handleSubmit((values) => mutation.mutate(values))}
    >
      <Textarea
        label="Reason"
        required
        rows={3}
        placeholder="e.g. Fixed it myself, no longer needed"
        counter={{ value: reason.length, max: 300 }}
        error={formState.errors.reason?.message}
        data-autofocus
        {...register('reason')}
      />
    </ConfirmDialog>
  );
}

export default CancelBookingDialog;
