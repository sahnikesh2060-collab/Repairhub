import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { Lock, MessageCircle, Send } from 'lucide-react';
import * as bookingsApi from '../../api/bookings.api.js';
import { appendMessage } from '../../lib/bookingCache.js';
import { queryKeys } from '../../lib/queryKeys.js';
import { formatTime, relativeTime } from '../../lib/format.js';
import { Button } from '../ui/Button.jsx';
import { Card, CardHeader } from '../ui/Card.jsx';
import { ErrorState } from '../ui/EmptyState.jsx';
import { SkeletonList } from '../ui/Skeleton.jsx';

const MAX = 1000;

/**
 * Chat between the customer and the assigned technician. New messages arrive through
 * useBookingRoom (booking_message), which appends to the same ['messages', id] cache.
 */
export function ChatPanel({
  bookingId,
  currentUserId,
  canSend,
  readOnlyNote,
  typingUser,
  onTyping,
  now,
}) {
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const bottomRef = useRef(null);

  const query = useQuery({
    queryKey: queryKeys.messages(bookingId),
    queryFn: () => bookingsApi.listMessages(bookingId, { limit: 100 }),
  });
  const messages = query.data?.messages ?? [];

  const send = useMutation({
    mutationFn: (body) => bookingsApi.sendMessage(bookingId, body),
    onSuccess: (message) => {
      appendMessage(queryClient, bookingId, message);
      setText('');
    },
    onError: (err) => toast.error(err.message),
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [messages.length, typingUser]);

  const submit = (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || body.length > MAX || send.isPending) return;
    send.mutate(body);
  };

  const unavailable = query.error?.code === 'CHAT_UNAVAILABLE';

  return (
    <Card padded={false} className="flex flex-col">
      <div className="px-5 pt-5">
        <CardHeader
          title={
            <span className="inline-flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-blue-600" aria-hidden /> Messages
            </span>
          }
          className="mb-3"
        />
      </div>
      <div
        className="max-h-96 min-h-40 space-y-3 overflow-y-auto border-y border-slate-100 bg-slate-50/50 px-5 py-4"
        aria-live="polite"
      >
        {query.isLoading && <SkeletonList count={2} className="h-10" />}
        {query.isError && !unavailable && (
          <ErrorState error={query.error} onRetry={query.refetch} />
        )}
        {unavailable && <p className="text-sm text-slate-500">{query.error.message}</p>}
        {!query.isLoading && !query.isError && messages.length === 0 && (
          <p className="py-6 text-center text-sm text-slate-500">No messages yet. Say hello!</p>
        )}
        {messages.map((m) => {
          const mine = String(m.senderId) === String(currentUserId);
          return (
            <div key={m._id} className={clsx('flex', mine ? 'justify-end' : 'justify-start')}>
              <div
                className={clsx(
                  'max-w-[80%] rounded-2xl px-3.5 py-2 text-sm shadow-sm',
                  mine
                    ? 'rounded-br-sm bg-blue-600 text-white'
                    : 'rounded-bl-sm bg-white text-slate-800 ring-1 ring-slate-200',
                )}
              >
                <p className="whitespace-pre-wrap break-words">{m.text}</p>
                <p className={clsx('mt-1 text-[11px]', mine ? 'text-blue-100' : 'text-slate-400')}>
                  <span className="sr-only">{mine ? 'You' : (m.senderName ?? m.senderRole)}, </span>
                  <time dateTime={m.createdAt} title={relativeTime(m.createdAt, now)}>
                    {formatTime(m.createdAt)}
                  </time>
                </p>
              </div>
            </div>
          );
        })}
        {typingUser && <p className="text-xs italic text-slate-500">{typingUser} is typing…</p>}
        <div ref={bottomRef} />
      </div>
      {canSend ? (
        <form onSubmit={submit} className="flex items-end gap-2 p-3">
          <label htmlFor={`chat-${bookingId}`} className="sr-only">
            Write a message
          </label>
          <textarea
            id={`chat-${bookingId}`}
            rows={1}
            value={text}
            maxLength={MAX}
            onChange={(e) => {
              setText(e.target.value);
              onTyping?.();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) submit(e);
            }}
            placeholder="Write a message…"
            className="min-h-10 flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <Button
            type="submit"
            icon={Send}
            loading={send.isPending}
            disabled={!text.trim()}
            aria-label="Send message"
          >
            <span className="hidden sm:inline">Send</span>
          </Button>
        </form>
      ) : (
        <p className="flex items-center gap-2 px-5 py-3 text-xs text-slate-500">
          <Lock className="h-3.5 w-3.5" aria-hidden />
          {readOnlyNote ?? 'This conversation is read-only.'}
        </p>
      )}
    </Card>
  );
}

export default ChatPanel;
