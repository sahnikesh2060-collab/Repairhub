import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, CalendarRange, Star, Wallet } from 'lucide-react';
import * as techniciansApi from '../../api/technicians.api.js';
import { useAuth } from '../../hooks/useAuth.js';
import { browserTzOffsetMinutes } from '../../lib/geo.js';
import { formatDate, formatDateTime, formatMoney } from '../../lib/format.js';
import { queryKeys } from '../../lib/queryKeys.js';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState.jsx';
import { SkeletonList } from '../../components/ui/Skeleton.jsx';
import { StarRating } from '../../components/ui/StarRating.jsx';
import { StatTile } from '../../components/ui/StatTile.jsx';

export default function Earnings() {
  const { user } = useAuth();
  const earnings = useQuery({
    queryKey: queryKeys.earnings,
    queryFn: () => techniciansApi.earnings(browserTzOffsetMinutes()),
  });
  const reviews = useQuery({
    queryKey: queryKeys.technicianPublic(user._id),
    queryFn: () => techniciansApi.publicProfile(user._id),
  });
  const e = earnings.data;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
        Earnings
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        Totals of final costs for completed jobs, in your time zone.
      </p>

      {earnings.isError ? (
        <div className="mt-6">
          <ErrorState error={earnings.error} onRetry={earnings.refetch} />
        </div>
      ) : (
        <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Totals">
          <StatTile
            label="Today"
            icon={Wallet}
            tone="green"
            loading={earnings.isLoading}
            value={formatMoney(e?.today.total ?? 0)}
            hint={`${e?.today.count ?? 0} jobs`}
          />
          <StatTile
            label="This week"
            icon={CalendarRange}
            loading={earnings.isLoading}
            value={formatMoney(e?.week.total ?? 0)}
            hint={`${e?.week.count ?? 0} jobs`}
          />
          <StatTile
            label="This month"
            icon={CalendarDays}
            tone="violet"
            loading={earnings.isLoading}
            value={formatMoney(e?.month.total ?? 0)}
            hint={`${e?.month.count ?? 0} jobs`}
          />
          <StatTile
            label="All time"
            icon={Star}
            tone="amber"
            loading={earnings.isLoading}
            value={formatMoney(e?.allTime.total ?? 0)}
            hint={`${e?.allTime.count ?? 0} jobs · ${(e?.ratingAvg ?? 0).toFixed(1)}★`}
          />
        </section>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" padded={false}>
          <div className="px-5 pt-5">
            <CardHeader title="Recent completed jobs" />
          </div>
          {earnings.isLoading && (
            <div className="px-5 pb-5">
              <SkeletonList count={3} className="h-10" />
            </div>
          )}
          {e && e.recentJobs.length === 0 && (
            <div className="px-5 pb-5">
              <EmptyState
                title="No completed jobs yet"
                description="Finished jobs and their final cost appear here."
              />
            </div>
          )}
          {e && e.recentJobs.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-y border-slate-200/70 bg-slate-50/80 text-[11px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th scope="col" className="px-5 py-2 font-semibold">
                      Job
                    </th>
                    <th scope="col" className="px-5 py-2 font-semibold">
                      Completed
                    </th>
                    <th scope="col" className="px-5 py-2 font-semibold">
                      Rating
                    </th>
                    <th scope="col" className="px-5 py-2 text-right font-semibold">
                      Final cost
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 [&>tr]:transition-colors [&>tr:hover]:bg-slate-50/70">
                  {e.recentJobs.map((j) => (
                    <tr key={j._id}>
                      <td className="px-5 py-3">
                        <Link
                          to={`/technician/jobs/${j._id}`}
                          className="font-medium text-slate-900 hover:text-blue-700"
                        >
                          {j.title}
                        </Link>
                        <span className="block font-mono text-xs text-slate-400">
                          {j.bookingCode}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-600">{formatDateTime(j.completedAt)}</td>
                      <td className="px-5 py-3">
                        {j.review?.rating ? `${j.review.rating}★` : '—'}
                      </td>
                      <td className="px-5 py-3 text-right font-semibold tabular-nums">
                        {formatMoney(j.finalCost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Rating and reviews" />
          {e && (
            <div className="mb-4 flex items-center gap-2">
              <StarRating value={e.ratingAvg ?? 0} showValue />
              <span className="text-sm text-slate-500">({e.ratingCount} reviews)</span>
            </div>
          )}
          {reviews.isLoading && <SkeletonList count={2} className="h-14" />}
          {reviews.isError && <ErrorState error={reviews.error} onRetry={reviews.refetch} />}
          {reviews.data && reviews.data.reviews.length === 0 && (
            <p className="text-sm text-slate-500">No reviews yet.</p>
          )}
          <ul className="space-y-3">
            {reviews.data?.reviews.map((r, i) => (
              <li key={i} className="rounded-lg border border-slate-100 p-3">
                <div className="flex items-center justify-between gap-2">
                  <StarRating value={r.rating} size="sm" />
                  <span className="text-xs text-slate-400">
                    {r.customerName} · {formatDate(r.createdAt)}
                  </span>
                </div>
                {r.comment && <p className="mt-1.5 text-sm text-slate-700">{r.comment}</p>}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
