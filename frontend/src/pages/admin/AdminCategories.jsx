import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowDown, ArrowUp, Pencil, Plus, Tags } from 'lucide-react';
import * as adminApi from '../../api/admin.api.js';
import { applyFieldErrors } from '../../api/client.js';
import { CATEGORY_ICONS, CategoryIcon } from '../../lib/categoryIcons.jsx';
import { queryKeys } from '../../lib/queryKeys.js';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { Select } from '../../components/ui/Select.jsx';
import { SkeletonList } from '../../components/ui/Skeleton.jsx';
import { Textarea } from '../../components/ui/Textarea.jsx';

const EMPTY = { key: '', name: '', icon: 'Wrench', description: '', sortOrder: 0, isActive: true };

function CategoryForm({ open, onClose, category, nextOrder }) {
  const queryClient = useQueryClient();
  const editing = Boolean(category);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(category ? { ...EMPTY, ...category } : { ...EMPTY, sortOrder: nextOrder });
  }, [open, category, nextOrder]);

  const mutation = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name.trim(),
        icon: form.icon,
        description: form.description.trim(),
        sortOrder: Number(form.sortOrder),
        isActive: form.isActive,
      };
      return editing
        ? adminApi.updateCategory(category._id, body)
        : adminApi.createCategory({ ...body, key: form.key.trim().toUpperCase() });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.adminCategories });
      queryClient.invalidateQueries({ queryKey: queryKeys.categories });
      toast.success(editing ? 'Category updated' : 'Category added');
      onClose();
    },
    onError: (err) => {
      const found = {};
      applyFieldErrors(
        err,
        (field, { message }) => {
          found[field] = message;
        },
        ['key', 'name', 'icon', 'description', 'sortOrder'],
      );
      setErrors(found);
      if (!Object.keys(found).length) toast.error(err.message);
    },
  });

  const submit = () => {
    const e = {};
    if (!editing && !/^[A-Z][A-Z_]{1,29}$/.test(form.key.trim().toUpperCase())) {
      e.key = 'Use 2-30 capital letters or underscores, e.g. PAINTING';
    }
    if (form.name.trim().length < 2) e.name = 'At least 2 characters';
    if (!Number.isInteger(Number(form.sortOrder)) || Number(form.sortOrder) < 0)
      e.sortOrder = 'Whole number, 0 or more';
    setErrors(e);
    if (Object.keys(e).length === 0) mutation.mutate();
  };

  const set = (field) => (ev) => setForm((f) => ({ ...f, [field]: ev.target.value }));

  return (
    <Modal
      open={open}
      onClose={mutation.isPending ? () => {} : onClose}
      title={editing ? `Edit ${category.name}` : 'Add a category'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={mutation.isPending}>
            {editing ? 'Save' : 'Add category'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Key"
          required
          disabled={editing}
          hint={
            editing
              ? 'Keys cannot change; bookings store them.'
              : 'Stored on bookings, e.g. PAINTING'
          }
          value={form.key}
          onChange={set('key')}
          error={errors.key}
        />
        <Input label="Name" required value={form.name} onChange={set('name')} error={errors.name} />
        <div className="grid grid-cols-[1fr_auto] items-end gap-3">
          <Select label="Icon" value={form.icon} onChange={set('icon')} error={errors.icon}>
            {Object.keys(CATEGORY_ICONS).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
          <span className="mb-1 rounded-lg bg-blue-50 p-2 text-blue-600">
            <CategoryIcon icon={form.icon} className="h-6 w-6" />
          </span>
        </div>
        <Textarea
          label="Description"
          rows={2}
          maxLength={300}
          value={form.description}
          onChange={set('description')}
          counter={{ value: form.description.length, max: 300 }}
        />
        <Input
          label="Sort order"
          type="number"
          min={0}
          value={form.sortOrder}
          onChange={set('sortOrder')}
          error={errors.sortOrder}
        />
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(ev) => setForm((f) => ({ ...f, isActive: ev.target.checked }))}
            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          Active (shown to customers and technicians)
        </label>
      </div>
    </Modal>
  );
}

export default function AdminCategories() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const query = useQuery({ queryKey: queryKeys.adminCategories, queryFn: adminApi.listCategories });
  const list = query.data ?? [];

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.adminCategories });
    queryClient.invalidateQueries({ queryKey: queryKeys.categories });
  };
  const toggle = useMutation({
    mutationFn: (c) => adminApi.updateCategory(c._id, { isActive: !c.isActive }),
    onSuccess: refresh,
    onError: (err) => toast.error(err.message),
  });
  // Reorder by swapping sortOrder with the neighbour (two PATCHes).
  const move = useMutation({
    mutationFn: async ({ a, b }) => {
      const aOrder = a.sortOrder === b.sortOrder ? b.sortOrder + 1 : b.sortOrder;
      await adminApi.updateCategory(a._id, { sortOrder: aOrder });
      await adminApi.updateCategory(b._id, { sortOrder: a.sortOrder });
    },
    onSuccess: refresh,
    onError: (err) => {
      toast.error(err.message);
      refresh();
    },
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          Categories
        </h1>
        <Button
          icon={Plus}
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          Add category
        </Button>
      </div>
      <div className="mt-6">
        {query.isLoading && <SkeletonList count={4} className="h-16" />}
        {query.isError && <ErrorState error={query.error} onRetry={query.refetch} />}
        {query.data && list.length === 0 && (
          <EmptyState
            icon={Tags}
            title="No categories"
            description="Add the first service category."
          />
        )}
        <ul className="space-y-2">
          {list.map((c, i) => (
            <li key={c._id}>
              <Card className="flex flex-wrap items-center gap-3 !p-4">
                <span className="rounded-lg bg-blue-50 p-2 text-blue-600">
                  <CategoryIcon icon={c.icon} categoryKey={c.key} className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-semibold text-slate-900">
                    {c.name} <span className="font-mono text-xs text-slate-400">{c.key}</span>
                    {!c.isActive && <Badge tone="neutral">Hidden</Badge>}
                  </p>
                  <p className="truncate text-sm text-slate-500">
                    {c.description || 'No description'}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={ArrowUp}
                    aria-label={`Move ${c.name} up`}
                    disabled={i === 0 || move.isPending}
                    onClick={() => move.mutate({ a: c, b: list[i - 1] })}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={ArrowDown}
                    aria-label={`Move ${c.name} down`}
                    disabled={i === list.length - 1 || move.isPending}
                    onClick={() => move.mutate({ a: c, b: list[i + 1] })}
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => toggle.mutate(c)}
                    loading={toggle.isPending && toggle.variables?._id === c._id}
                    aria-pressed={c.isActive}
                  >
                    {c.isActive ? 'Hide' : 'Show'}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={Pencil}
                    onClick={() => {
                      setEditing(c);
                      setFormOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </div>
      <CategoryForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        category={editing}
        nextOrder={(list.at(-1)?.sortOrder ?? 0) + 1}
      />
    </div>
  );
}
