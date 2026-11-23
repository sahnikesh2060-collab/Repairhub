import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Search } from 'lucide-react';
import * as adminApi from '../../api/admin.api.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js';
import { ROLE_LABEL } from '../../lib/constants.js';
import { formatDate } from '../../lib/format.js';
import { queryKeys } from '../../lib/queryKeys.js';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.jsx';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import { Select } from '../../components/ui/Select.jsx';
import { SkeletonList } from '../../components/ui/Skeleton.jsx';

export default function AdminUsers() {
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const [role, setRole] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState(null);
  const q = useDebouncedValue(search.trim());

  const params = { page, limit: 20, ...(role && { role }), ...(q && { q }) };
  const query = useQuery({
    queryKey: queryKeys.adminUsers(params),
    queryFn: () => adminApi.listUsers(params),
    placeholderData: keepPreviousData,
  });

  const toggle = useMutation({
    mutationFn: ({ id, isActive }) => adminApi.setUserActive(id, isActive),
    onSuccess: (_r, v) => {
      toast.success(v.isActive ? 'Account activated' : 'Account deactivated and signed out');
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      setTarget(null);
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Users</h1>
      <p className="mt-1 text-slate-600">
        Customers, technicians and admins. Deactivated accounts cannot sign in.
      </p>
      <Card className="mt-6" padded={false}>
        <div className="grid gap-3 p-5 sm:grid-cols-3">
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
            label="Role"
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All roles</option>
            <option value="customer">Customers</option>
            <option value="technician">Technicians</option>
            <option value="admin">Admins</option>
          </Select>
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
        {query.data && query.data.users.length === 0 && (
          <div className="px-5 pb-5">
            <EmptyState icon={Search} title="No users match" description="Try another search." />
          </div>
        )}
        {query.data && query.data.users.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-y border-slate-200/70 bg-slate-50/80 text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th scope="col" className="px-5 py-2 font-semibold">
                    Name
                  </th>
                  <th scope="col" className="px-5 py-2 font-semibold">
                    Contact
                  </th>
                  <th scope="col" className="px-5 py-2 font-semibold">
                    Role
                  </th>
                  <th scope="col" className="px-5 py-2 font-semibold">
                    Joined
                  </th>
                  <th scope="col" className="px-5 py-2 text-right font-semibold">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 [&>tr]:transition-colors [&>tr:hover]:bg-slate-50/70">
                {query.data.users.map((u) => (
                  <tr key={u._id}>
                    <td className="px-5 py-3 font-medium text-slate-900">{u.name}</td>
                    <td className="px-5 py-3 text-slate-600">
                      {u.email}
                      {u.phone && <span className="block text-xs text-slate-400">{u.phone}</span>}
                    </td>
                    <td className="px-5 py-3">{ROLE_LABEL[u.role]}</td>
                    <td className="px-5 py-3 text-slate-600">{formatDate(u.createdAt)}</td>
                    <td className="px-5 py-3 text-right">
                      <span className="inline-flex items-center gap-2">
                        <Badge tone={u.isActive ? 'green' : 'red'}>
                          {u.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                        {u._id !== me._id && (
                          <Button
                            size="sm"
                            variant={u.isActive ? 'danger-outline' : 'secondary'}
                            onClick={() => setTarget(u)}
                          >
                            {u.isActive ? 'Deactivate' : 'Activate'}
                          </Button>
                        )}
                      </span>
                    </td>
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

      <ConfirmDialog
        open={Boolean(target)}
        onClose={() => setTarget(null)}
        tone={target?.isActive ? 'danger' : 'primary'}
        title={target?.isActive ? `Deactivate ${target?.name}?` : `Activate ${target?.name}?`}
        confirmLabel={target?.isActive ? 'Deactivate' : 'Activate'}
        loading={toggle.isPending}
        onConfirm={() => toggle.mutate({ id: target._id, isActive: !target.isActive })}
      >
        <p className="text-sm text-slate-600">
          {target?.isActive
            ? 'They are signed out everywhere and cannot sign in until reactivated. Technicians go offline.'
            : 'They can sign in again.'}
        </p>
      </ConfirmDialog>
    </div>
  );
}
