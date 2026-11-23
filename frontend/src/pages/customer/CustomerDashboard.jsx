import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ClipboardList, History, Plus } from 'lucide-react';
import * as bookingsApi from '../../api/bookings.api.js';
import * as categoriesApi from '../../api/categories.api.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useNow } from '../../hooks/useNow.js';
import { CategoryBadgeIcon } from '../../lib/categoryIcons.jsx';
import { firstName } from '../../lib/format.js';
import { queryKeys } from '../../lib/queryKeys.js';
import { BookingCard } from '../../components/booking/BookingCard.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState.jsx';
import { Skeleton, SkeletonList } from '../../components/ui/Skeleton.jsx';
import { Tabs } from '../../components/ui/Tabs.jsx';

const PAGE_SIZE = 10;

function greeting(now) {
  const h = now.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function useBookings(status, page) {
  return useQuery({
    queryKey: [...queryKeys.myBookings(status), page],
    queryFn: () => bookingsApi.listMyBookings({ status, page, limit: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
}

export default function CustomerDashboard() {
  const { user } = useAuth();
  const now = useNow(30_000);
  const [tab, setTab] = useState('active');
  const [pages, setPages] = useState({ active: 1, past: 1 });

  const categories = useQuery({
    queryKey: queryKeys.categories,
    queryFn: categoriesApi.listCategories,
    staleTime: 5 * 60_000,
  });
  const active = useBookings('active', pages.active);
  const past = useBookings('past', pages.past);
  const current = tab === 'active' ? active : past;
  const meta = current.data?.meta;
  const iconByKey = Object.fromEntries((categories.data ?? []).map((c) => [c.key, c.icon]));
  const setPage = (p) => setPages((s) => ({ ...s, [tab]: p }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="rh-brand-gradient relative flex flex-wrap items-center justify-between gap-4 overflow-hidden rounded-3xl px-6 py-7 text-white shadow-(--shadow-lift) sm:px-8">
        <div className="rh-dots pointer-events-none absolute inset-0 opacity-20" />
        <div className="relative">
          <h1 className="text-2xl font-extrabold sm:text-3xl">
            {greeting(now)}, {firstName(user.name)}
          </h1>
          <p className="mt-1 text-blue-50">What can we fix for you today?</p>
        </div>
        <Button
          as={Link}
          to="/customer/bookings/new"
          size="lg"
          variant="secondary"
          icon={Plus}
          className="relative"
        >
          Book a repair
        </Button>
      </div>

      <section className="mt-8" aria-labelledby="quick-book">
        <h2 id="quick-book" className="sr-only">
          Book by category
        </h2>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {categories.isLoading &&
            Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-24" />)}
          {categories.data?.map((c) => (
            <Link
              key={c.key}
              to={`/customer/bookings/new?category=${c.key}`}
              className="flex flex-col items-center gap-2.5 rounded-2xl border border-slate-200/80 bg-white p-4 text-center shadow-(--shadow-soft) transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-(--shadow-lift) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <CategoryBadgeIcon icon={c.icon} categoryKey={c.key} className="self-center" />
              <span className="text-xs font-semibold text-slate-800 sm:text-sm">{c.name}</span>
            </Link>
          ))}
        </div>
        {categories.isError && (
          <div className="mt-3">
            <ErrorState
              error={categories.error}
              onRetry={categories.refetch}
              title="Could not load categories"
            />
          </div>
        )}
      </section>

      <section className="mt-10" aria-labelledby="bookings-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="bookings-heading" className="text-lg font-semibold text-slate-900">
            My bookings
          </h2>
          <Tabs
            label="Booking filter"
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'active', label: 'Active', count: active.data?.meta?.total },
              { id: 'past', label: 'Past', count: past.data?.meta?.total },
            ]}
          />
        </div>

        <div id={`tabpanel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="mt-4">
          {current.isLoading && <SkeletonList count={3} />}
          {current.isError && <ErrorState error={current.error} onRetry={current.refetch} />}
          {current.data && current.data.bookings.length === 0 && (
            <EmptyState
              icon={tab === 'active' ? ClipboardList : History}
              title={tab === 'active' ? 'No active bookings' : 'No past bookings yet'}
              description={
                tab === 'active'
                  ? 'Book a repair and nearby technicians will be alerted straight away.'
                  : 'Completed and cancelled bookings will appear here.'
              }
              action={
                tab === 'active' && (
                  <Button as={Link} to="/customer/bookings/new" icon={Plus}>
                    Book a repair
                  </Button>
                )
              }
            />
          )}
          {current.data && current.data.bookings.length > 0 && (
            <ul className="space-y-3">
              {current.data.bookings.map((b) => (
                <li key={b._id}>
                  <BookingCard
                    booking={b}
                    to={`/customer/bookings/${b._id}`}
                    now={now}
                    categoryIcon={iconByKey[b.category]}
                  />
                </li>
              ))}
            </ul>
          )}
          {meta && meta.totalPages > 1 && (
            <nav className="mt-4 flex items-center justify-between" aria-label="Pagination">
              <Button
                variant="secondary"
                size="sm"
                disabled={meta.page <= 1}
                onClick={() => setPage(meta.page - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-slate-600">
                Page {meta.page} of {meta.totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={meta.page >= meta.totalPages}
                onClick={() => setPage(meta.page + 1)}
              >
                Next
              </Button>
            </nav>
          )}
        </div>
      </section>
    </div>
  );
}
