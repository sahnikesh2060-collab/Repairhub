import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { BadgeCheck, Search, ShieldAlert, UserX } from 'lucide-react';
import * as adminApi from '../../api/admin.api.js';
import * as categoriesApi from '../../api/categories.api.js';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js';
import { formatDate } from '../../lib/format.js';
import { queryKeys } from '../../lib/queryKeys.js';
import { Avatar } from '../../components/ui/Avatar.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.jsx';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import { Select } from '../../components/ui/Select.jsx';
import { SkeletonList } from '../../components/ui/Skeleton.jsx';

function useTechnicianActions() {
  const queryClient = useQueryClient();
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'technicians'] });
    queryClient.invalidateQueries({ queryKey: queryKeys.adminStats });
  };
  const verify = useMutation({
    mutationFn: ({ userId, isVerified }) => adminApi.verifyTechnician(userId, isVerified),
    onSuccess: (_r, v) => {
      toast.success(v.isVerified ? 'Technician verified' : 'Verification withdrawn');
      refresh();
    },
    onError: (err) => toast.error(err.message),
  });
  const deactivate = useMutation({
    mutationFn: ({ userId }) => adminApi.setUserActive(userId, false),
    onSuccess: () => {
      toast.success('Account deactivated');
      refresh();
    },
    onError: (err) => toast.error(err.message),
  });
  return { verify, deactivate };
}

export default function AdminTechnicians() {
  const [confirm, setConfirm] = useState(null);
  const [filters, setFilters] = useState({ category: '', verified: '', online: '' });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebouncedValue(search.trim());
  const { verify, deactivate } = useTechnicianActions();

  const categories = useQuery({
    queryKey: queryKeys.categories,
    queryFn: categoriesApi.listCategories,
  });
  const pending = useQuery({
    queryKey: queryKeys.adminTechnicians({ verified: 'false', limit: 50 }),
    queryFn: () => adminApi.listTechnicians({ verified: 'false', limit: 50 }),
  });
  const params = {
    page,
    limit: 15,
    ...(filters.category && { category: filters.category }),
    ...(filters.verified && { verified: filters.verified }),
    ...(filters.online && { online: filters.online }),
    ...(q && { q }),
  };
  const all = useQuery({
    queryKey: queryKeys.adminTechnicians(params),
    queryFn: () => adminApi.listTechnicians(params),
    placeholderData: keepPreviousData,
  });
  const setFilter = (key, value) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };

  const pendingActive = (pending.data?.technicians ?? []).filter((t) => t.user.isActive);
  const runConfirm = () => {
    const done = { onSettled: () => setConfirm(null) };
    if (confirm.kind === 'approve')
      verify.mutate({ userId: confirm.t.userId, isVerified: true }, done);
    if (confirm.kind === 'unverify')
      verify.mutate({ userId: confirm.t.userId, isVerified: false }, done);
    if (confirm.kind === 'reject') deactivate.mutate({ userId: confirm.t.userId }, done);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
        Technicians
      </h1>
      <p className="mt-1 text-slate-600">
        Verify new technicians and manage everyone on the platform.
      </p>

      <Card className="mt-6">
        <CardHeader
          title={
            <span className="inline-flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-600" aria-hidden /> Pending verification
            </span>
          }
          description="Approve technicians before they can receive jobs."
        />
        {pending.isLoading && <SkeletonList count={2} className="h-16" />}
        {pending.isError && <ErrorState error={pending.error} onRetry={pending.refetch} />}
        {pending.data && pendingActive.length === 0 && (
          <p className="text-sm text-slate-500">No technicians are waiting for verification.</p>
        )}
        <ul className="divide-y divide-slate-100">
          {pendingActive.map((t) => (
            <li key={t._id} className="flex flex-wrap items-center gap-3 py-3">
              <Avatar name={t.user.name} src={t.user.avatar} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">{t.user.name}</p>
                <p className="truncate text-sm text-slate-500">
                  {t.user.email} · {t.categories.join(', ') || 'no categories yet'} ·{' '}
                  {t.experienceYears} yrs · joined {formatDate(t.user.createdAt)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  icon={BadgeCheck}
                  onClick={() => setConfirm({ kind: 'approve', t })}
                  disabled={!t.categories.length}
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="danger-outline"
                  icon={UserX}
                  onClick={() => setConfirm({ kind: 'reject', t })}
                >
                  Reject
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="mt-6" padded={false}>
        <div className="space-y-4 p-5">
          <CardHeader title="All technicians" className="mb-0" />
          <div className="grid gap-3 sm:grid-cols-4">
            <Input
              label="Search"
              placeholder="Name, email or phone"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
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
            <Select
              label="Verified"
              value={filters.verified}
              onChange={(e) => setFilter('verified', e.target.value)}
            >
              <option value="">All</option>
              <option value="true">Verified</option>
              <option value="false">Not verified</option>
            </Select>
            <Select
              label="Online"
              value={filters.online}
              onChange={(e) => setFilter('online', e.target.value)}
            >
              <option value="">All</option>
              <option value="true">Online</option>
              <option value="false">Offline</option>
            </Select>
          </div>
        </div>
        {all.isLoading && (
          <div className="px-5 pb-5">
            <SkeletonList count={4} className="h-12" />
          </div>
        )}
        {all.isError && (
          <div className="px-5 pb-5">
            <ErrorState error={all.error} onRetry={all.refetch} />
          </div>
        )}
        {all.data && all.data.technicians.length === 0 && (
          <div className="px-5 pb-5">
            <EmptyState
              icon={Search}
              title="No technicians match"
              description="Try different filters."
            />
          </div>
        )}
        {all.data && all.data.technicians.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-y border-slate-200/70 bg-slate-50/80 text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th scope="col" className="px-5 py-2 font-semibold">
                    Technician
                  </th>
                  <th scope="col" className="px-5 py-2 font-semibold">
                    Categories
                  </th>
                  <th scope="col" className="px-5 py-2 font-semibold">
                    Status
                  </th>
                  <th scope="col" className="px-5 py-2 font-semibold">
                    Rating / jobs
                  </th>
                  <th scope="col" className="px-5 py-2 text-right font-semibold">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 [&>tr]:transition-colors [&>tr:hover]:bg-slate-50/70">
                {all.data.technicians.map((t) => (
                  <tr key={t._id}>
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-900">{t.user.name}</p>
                      <p className="text-xs text-slate-500">{t.user.email}</p>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{t.categories.join(', ') || '—'}</td>
                    <td className="space-x-1 px-5 py-3">
                      <Badge tone={t.isVerified ? 'green' : 'amber'}>
                        {t.isVerified ? 'Verified' : 'Unverified'}
                      </Badge>
                      <Badge tone={t.isAvailable ? 'blue' : 'neutral'}>
                        {t.isAvailable ? 'Online' : 'Offline'}
                      </Badge>
                      {!t.user.isActive && <Badge tone="red">Inactive</Badge>}
                    </td>
                    <td className="px-5 py-3 tabular-nums">
                      {t.ratingAvg.toFixed(1)}★ ({t.ratingCount}) · {t.completedJobs}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {t.isVerified ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setConfirm({ kind: 'unverify', t })}
                        >
                          Unverify
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => setConfirm({ kind: 'approve', t })}
                          disabled={!t.categories.length}
                        >
                          Verify
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-5 pb-5">
          <Pagination meta={all.data?.meta} onChange={setPage} />
        </div>
      </Card>

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={runConfirm}
        loading={verify.isPending || deactivate.isPending}
        tone={confirm?.kind === 'approve' ? 'primary' : 'danger'}
        title={
          {
            approve: `Verify ${confirm?.t.user.name}?`,
            unverify: `Withdraw verification for ${confirm?.t.user.name}?`,
            reject: `Reject ${confirm?.t.user.name}?`,
          }[confirm?.kind] ?? ''
        }
        confirmLabel={
          { approve: 'Verify', unverify: 'Withdraw', reject: 'Reject and deactivate' }[
            confirm?.kind
          ]
        }
      >
        <p className="text-sm text-slate-600">
          {confirm?.kind === 'approve' &&
            'They will be notified and start receiving nearby requests when online.'}
          {confirm?.kind === 'unverify' && 'They go offline and stop receiving new requests.'}
          {confirm?.kind === 'reject' &&
            'The account is deactivated and signed out everywhere. You can reactivate it from Users.'}
        </p>
      </ConfirmDialog>
    </div>
  );
}
