import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { format } from 'date-fns';
import { CheckCircle2, ClipboardList, ShieldAlert, Users } from 'lucide-react';
import * as adminApi from '../../api/admin.api.js';
import { STATUS, STATUS_HEX } from '../../lib/constants.js';
import { queryKeys } from '../../lib/queryKeys.js';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { ErrorState } from '../../components/ui/EmptyState.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { StatTile } from '../../components/ui/StatTile.jsx';

export default function AdminOverview() {
  const query = useQuery({
    queryKey: queryKeys.adminStats,
    queryFn: adminApi.stats,
    refetchInterval: 60_000,
  });
  const s = query.data;

  const byStatus = s
    ? Object.entries(s.bookingsByStatus).map(([status, count]) => ({
        status,
        label: STATUS[status]?.label ?? status,
        count,
      }))
    : [];
  const perDay = s
    ? s.bookingsPerDay.map((d) => ({
        ...d,
        day: format(new Date(`${d.date}T12:00:00Z`), 'EEE d'),
      }))
    : [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
        Overview
      </h1>
      <p className="mt-1 text-slate-600">How RepairHub is doing right now.</p>
      {query.isError && (
        <div className="mt-6">
          <ErrorState error={query.error} onRetry={query.refetch} />
        </div>
      )}
      <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Key numbers">
        <StatTile
          label="Users"
          icon={Users}
          loading={query.isLoading}
          value={s?.totalUsers ?? 0}
          hint={
            s
              ? `${s.usersByRole.customer} customers · ${s.usersByRole.technician} technicians`
              : undefined
          }
        />
        <StatTile
          label="Pending verification"
          icon={ShieldAlert}
          tone="amber"
          loading={query.isLoading}
          value={s?.techniciansPendingVerification ?? 0}
          hint="Technicians waiting for approval"
        />
        <StatTile
          label="Bookings"
          icon={ClipboardList}
          tone="violet"
          loading={query.isLoading}
          value={s?.totalBookings ?? 0}
        />
        <StatTile
          label="Completion rate"
          icon={CheckCircle2}
          tone="green"
          loading={query.isLoading}
          value={`${Math.round((s?.completionRate ?? 0) * 100)}%`}
          hint="Completed ÷ (completed + cancelled)"
        />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Bookings by status" />
          {query.isLoading ? (
            <Skeleton className="h-64" />
          ) : (
            <div
              className="h-64"
              role="img"
              aria-label={byStatus.map((b) => `${b.label}: ${b.count}`).join(', ')}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byStatus} margin={{ top: 8, right: 8, left: -16, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="label"
                    angle={-35}
                    textAnchor="end"
                    interval={0}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="count" name="Bookings" radius={[4, 4, 0, 0]}>
                    {byStatus.map((b) => (
                      <Cell key={b.status} fill={STATUS_HEX[b.status] ?? '#64748b'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
        <Card>
          <CardHeader title="Bookings, last 7 days" description="New bookings per day (UTC)" />
          {query.isLoading ? (
            <Skeleton className="h-64" />
          ) : (
            <div
              className="h-64"
              role="img"
              aria-label={perDay.map((d) => `${d.day}: ${d.count}`).join(', ')}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={perDay} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="count"
                    name="Bookings"
                    stroke="#2563eb"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
