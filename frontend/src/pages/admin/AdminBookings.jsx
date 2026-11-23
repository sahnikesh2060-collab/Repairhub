import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, XCircle } from 'lucide-react';
import * as adminApi from '../../api/admin.api.js';
import * as categoriesApi from '../../api/categories.api.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js';
import { useNow } from '../../hooks/useNow.js';
import { ACTIONS, STATUS } from '../../lib/constants.js';
import { formatDateTime, formatMoney } from '../../lib/format.js';
import { queryKeys } from '../../lib/queryKeys.js';
import { BookingTracker } from '../../components/booking/BookingTracker.jsx';
import { CancelBookingDialog } from '../../components/booking/CancelBookingDialog.jsx';
import { ChatPanel } from '../../components/booking/ChatPanel.jsx';
import { StatusBadge } from '../../components/booking/StatusBadge.jsx';
import { StatusTimeline } from '../../components/booking/StatusTimeline.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import { Select } from '../../components/ui/Select.jsx';
import { SkeletonList } from '../../components/ui/Skeleton.jsx';

const RESPONSE_TONE = { PENDING: 'neutral', ACCEPTED: 'green', DECLINED: 'red', RELEASED: 'amber' };

function BookingDrawer({ bookingId, onClose }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const now = useNow(30_000);
  const [cancelOpen, setCancelOpen] = useState(false);
  const query = useQuery({
    queryKey: queryKeys.adminBooking(bookingId),
    queryFn: () => adminApi.getBooking(bookingId),
    enabled: Boolean(bookingId),
  });
  const b = query.data;

  return (
    <Modal
      open={Boolean(bookingId)}
      onClose={onClose}
      placement="right"
      size="xl"
      title={b ? `${b.bookingCode} · ${b.title}` : 'Booking'}
      footer={
        b?.allowedActions?.includes(ACTIONS.CANCEL) && (
          <Button variant="danger-outline" icon={XCircle} onClick={() => setCancelOpen(true)}>
            Cancel booking
          </Button>
        )
      }
    >
      {query.isLoading && <SkeletonList count={4} className="h-20" />}
      {query.isError && <ErrorState error={query.error} onRetry={query.refetch} />}
      {b && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <StatusBadge status={b.status} />
            <span>{b.category}</span>·<span>{formatDateTime(b.createdAt)}</span>
            {b.finalCost !== undefined && b.finalCost !== null && (
              <span>· final {formatMoney(b.finalCost)}</span>
            )}
          </div>
          <BookingTracker booking={b} />
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-lg bg-slate-50 p-3">
              <dt className="text-xs text-slate-500">Customer</dt>
              <dd className="font-medium text-slate-900">{b.customer?.name}</dd>
              <dd className="text-slate-600">{b.customer?.phone ?? '—'}</dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <dt className="text-xs text-slate-500">Technician</dt>
              <dd className="font-medium text-slate-900">{b.technician?.name ?? 'Not assigned'}</dd>
              <dd className="text-slate-600">{b.technician?.phone ?? ''}</dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 sm:col-span-2">
              <dt className="text-xs text-slate-500">Address</dt>
              <dd className="text-slate-900">{b.location?.addressText}</dd>
              <dd className="mt-1 whitespace-pre-wrap text-slate-600">{b.description}</dd>
            </div>
          </dl>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-900">Notified technicians</h3>
            {b.notifiedTechnicians?.length ? (
              <div className="overflow-x-auto rounded-lg border border-slate-100">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th scope="col" className="px-3 py-2">
                        Technician
                      </th>
                      <th scope="col" className="px-3 py-2">
                        Distance
                      </th>
                      <th scope="col" className="px-3 py-2">
                        Notified
                      </th>
                      <th scope="col" className="px-3 py-2">
                        Response
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 [&>tr]:transition-colors [&>tr:hover]:bg-slate-50/70">
                    {b.notifiedTechnicians.map((n) => (
                      <tr key={n.technicianId?._id ?? n.notifiedAt}>
                        <td className="px-3 py-2">{n.technicianId?.name ?? 'Deleted user'}</td>
                        <td className="px-3 py-2 tabular-nums">{n.distanceKm ?? '—'} km</td>
                        <td className="px-3 py-2">{formatDateTime(n.notifiedAt)}</td>
                        <td className="px-3 py-2">
                          <Badge tone={RESPONSE_TONE[n.response]}>{n.response}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-slate-500">No technicians were notified.</p>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-900">
              Timeline and schedule history
            </h3>
            <StatusTimeline booking={b} />
          </section>

          {b.technician && (
            <ChatPanel
              bookingId={b._id}
              currentUserId={user._id}
              canSend={false}
              readOnlyNote="Admins can read the conversation but not write in it."
              now={now}
            />
          )}
        </div>
      )}
      {b && (
        <CancelBookingDialog
          open={cancelOpen}
          onClose={() => setCancelOpen(false)}
          bookingId={b._id}
          hasTechnician={Boolean(b.technician)}
          onCancelled={() => {
            queryClient.invalidateQueries({ queryKey: ['admin'] });
          }}
        />
      )}
    </Modal>
  );
}

const dayStart = (d) => (d ? new Date(`${d}T00:00:00`).toISOString() : undefined);
const dayEnd = (d) => (d ? new Date(`${d}T23:59:59.999`).toISOString() : undefined);

export default function AdminBookings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const openId = searchParams.get('open');
  const [filters, setFilters] = useState({ status: '', category: '', from: '', to: '' });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebouncedValue(search.trim());

  const categories = useQuery({
    queryKey: queryKeys.categories,
    queryFn: categoriesApi.listCategories,
  });
  const params = {
    page,
    limit: 20,
    ...(filters.status && { status: filters.status }),
    ...(filters.category && { category: filters.category }),
    ...(filters.from && { from: dayStart(filters.from) }),
    ...(filters.to && { to: dayEnd(filters.to) }),
    ...(q && { q }),
  };
  const query = useQuery({
    queryKey: queryKeys.adminBookings(params),
    queryFn: () => adminApi.listBookings(params),
    placeholderData: keepPreviousData,
  });
  const setFilter = (key, value) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };
  const open = (id) => setSearchParams(id ? { open: id } : {});

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
        Bookings
      </h1>
      <p className="mt-1 text-slate-600">
        Search, filter and open any booking to see its full history.
      </p>
      <Card className="mt-6" padded={false}>
        <div className="grid gap-3 p-5 sm:grid-cols-5">
          <Input
            label="Booking code"
            placeholder="REP-2026-…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <Select
            label="Status"
            value={filters.status}
            onChange={(e) => setFilter('status', e.target.value)}
          >
            <option value="">All</option>
            {Object.entries(STATUS).map(([key, meta]) => (
              <option key={key} value={key}>
                {meta.label}
              </option>
            ))}
          </Select>
          <Select
            label="Category"
            value={filters.category}
            onChange={(e) => setFilter('category', e.target.value)}
          >
            <option value="">All</option>
            {categories.data?.map((c) => (
              <option key={c.key} value={c.key}>
                {c.name}
              </option>
            ))}
          </Select>
          <Input
            label="From"
            type="date"
            value={filters.from}
            onChange={(e) => setFilter('from', e.target.value)}
          />
          <Input
            label="To"
            type="date"
            value={filters.to}
            onChange={(e) => setFilter('to', e.target.value)}
          />
        </div>
        {query.isLoading && (
          <div className="px-5 pb-5">
            <SkeletonList count={5} className="h-12" />
          </div>
        )}
        {query.isError && (
          <div className="px-5 pb-5">
            <ErrorState error={query.error} onRetry={query.refetch} />
          </div>
        )}
        {query.data && query.data.bookings.length === 0 && (
          <div className="px-5 pb-5">
            <EmptyState icon={Search} title="No bookings match" description="Try other filters." />
          </div>
        )}
        {query.data && query.data.bookings.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-y border-slate-200/70 bg-slate-50/80 text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th scope="col" className="px-5 py-2 font-semibold">
                    Booking
                  </th>
                  <th scope="col" className="px-5 py-2 font-semibold">
                    Customer
                  </th>
                  <th scope="col" className="px-5 py-2 font-semibold">
                    Technician
                  </th>
                  <th scope="col" className="px-5 py-2 font-semibold">
                    Status
                  </th>
                  <th scope="col" className="px-5 py-2 font-semibold">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 [&>tr]:transition-colors [&>tr:hover]:bg-slate-50/70">
                {query.data.bookings.map((b) => (
                  <tr key={b._id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <button
                        type="button"
                        onClick={() => open(b._id)}
                        className="rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      >
                        <span className="block font-mono text-xs text-slate-500">
                          {b.bookingCode}
                        </span>
                        <span className="font-medium text-blue-700 hover:underline">{b.title}</span>
                      </button>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{b.customerId?.name}</td>
                    <td className="px-5 py-3 text-slate-600">{b.technicianId?.name ?? '—'}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={b.status} />
                    </td>
                    <td className="px-5 py-3 text-slate-600">{formatDateTime(b.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-5 pb-5">
          <Pagination meta={query.data?.meta} onChange={setPage} />
        </div>
      </Card>
      <BookingDrawer bookingId={openId} onClose={() => open(null)} />
    </div>
  );
}
