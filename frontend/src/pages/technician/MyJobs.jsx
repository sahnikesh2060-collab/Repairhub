import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Briefcase } from 'lucide-react';
import * as bookingsApi from '../../api/bookings.api.js';
import { useNow } from '../../hooks/useNow.js';
import { queryKeys } from '../../lib/queryKeys.js';
import { BookingCard } from '../../components/booking/BookingCard.jsx';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import { SkeletonList } from '../../components/ui/Skeleton.jsx';
import { Tabs } from '../../components/ui/Tabs.jsx';

// Tab ids are server-side list filters (GET /bookings/technician/my?status=...).
const TABS = [
  { id: 'awaiting', label: 'Awaiting customer', empty: 'No proposals waiting for a customer.' },
  { id: 'upcoming', label: 'Upcoming', empty: 'No confirmed jobs coming up.' },
  { id: 'ongoing', label: 'Active', empty: 'No job in progress right now.' },
  { id: 'completed', label: 'Completed', empty: 'Completed jobs will appear here.' },
  { id: 'cancelled', label: 'Cancelled', empty: 'No cancelled jobs.' },
];

export default function MyJobs() {
  const now = useNow(30_000);
  const [tab, setTab] = useState('upcoming');
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: [...queryKeys.assignedBookings(tab), page],
    queryFn: () => bookingsApi.listAssignedBookings({ status: tab, page, limit: 10 }),
    placeholderData: keepPreviousData,
  });
  const current = TABS.find((t) => t.id === tab);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">My jobs</h1>
      <p className="mt-1 text-slate-600">
        Every job you have accepted, grouped by where it stands.
      </p>
      <div className="mt-6 overflow-x-auto">
        <Tabs
          label="Job filter"
          value={tab}
          onChange={(id) => {
            setTab(id);
            setPage(1);
          }}
          tabs={TABS.map((t) => ({
            id: t.id,
            label: t.label,
            count: t.id === tab ? query.data?.meta?.total : undefined,
          }))}
        />
      </div>
      <div id={`tabpanel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="mt-4">
        {query.isLoading && <SkeletonList count={3} />}
        {query.isError && <ErrorState error={query.error} onRetry={query.refetch} />}
        {query.data && query.data.bookings.length === 0 && (
          <EmptyState icon={Briefcase} title="Nothing here" description={current.empty} />
        )}
        {query.data && query.data.bookings.length > 0 && (
          <ul className="space-y-3">
            {query.data.bookings.map((b) => (
              <li key={b._id}>
                <BookingCard booking={b} to={`/technician/jobs/${b._id}`} now={now} />
              </li>
            ))}
          </ul>
        )}
        <Pagination meta={query.data?.meta} onChange={setPage} />
      </div>
    </div>
  );
}
