import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import * as bookingsApi from '../../api/bookings.api.js';
import { queryKeys } from '../../lib/queryKeys.js';
import { Button } from '../ui/Button.jsx';
import { Card, CardHeader } from '../ui/Card.jsx';
import { StarRating } from '../ui/StarRating.jsx';
import { Textarea } from '../ui/Textarea.jsx';

const MAX = 1000;

export function ReviewForm({ bookingId, technicianName }) {
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      bookingsApi.reviewBooking(bookingId, { rating, comment: comment.trim() || undefined }),
    onSuccess: ({ booking }) => {
      queryClient.setQueryData(queryKeys.booking(bookingId), booking);
      queryClient.invalidateQueries({ queryKey: queryKeys.bookingsAll });
      toast.success('Thanks for your review!');
    },
    onError: (err) => setError(err.message),
  });

  const submit = (e) => {
    e.preventDefault();
    if (rating < 1) {
      setError('Choose a rating from 1 to 5 stars.');
      return;
    }
    if (comment.length > MAX) return;
    setError('');
    mutation.mutate();
  };

  return (
    <Card>
      <CardHeader
        title={`How did ${technicianName ?? 'the technician'} do?`}
        description="Your review helps neighbours choose good technicians."
      />
      <form onSubmit={submit} className="space-y-4" noValidate>
        <StarRating value={rating} onChange={setRating} size="lg" label="Your rating" />
        <Textarea
          label="Comment (optional)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          counter={{ value: comment.length, max: MAX }}
          error={comment.length > MAX ? `Keep it under ${MAX} characters` : undefined}
          rows={3}
          placeholder="Punctual, tidy, fixed it first time…"
        />
        {error && (
          <p className="text-sm font-medium text-red-600" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" loading={mutation.isPending}>
          Submit review
        </Button>
      </form>
    </Card>
  );
}

export default ReviewForm;
