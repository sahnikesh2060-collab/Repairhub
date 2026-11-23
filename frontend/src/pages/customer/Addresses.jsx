import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Home, MapPin, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import * as authApi from '../../api/auth.api.js';
import { applyFieldErrors } from '../../api/client.js';
import { queryKeys } from '../../lib/queryKeys.js';
import { LocationPicker } from '../../components/map/LocationPicker.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.jsx';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { SkeletonList } from '../../components/ui/Skeleton.jsx';

// Mirrors backend: label 1-40, addressText 3-300, lng/lat in range.
const schema = z.object({
  label: z.string().trim().min(1, 'Give it a name, e.g. Home').max(40, 'At most 40 characters'),
  addressText: z.string().trim().min(3, 'At least 3 characters').max(300, 'At most 300 characters'),
  lng: z
    .number({
      required_error: 'Pick the location on the map',
      invalid_type_error: 'Pick the location on the map',
    })
    .min(-180)
    .max(180),
  lat: z
    .number({
      required_error: 'Pick the location on the map',
      invalid_type_error: 'Pick the location on the map',
    })
    .min(-90)
    .max(90),
  isDefault: z.boolean(),
});

function AddressForm({ open, onClose, address }) {
  const queryClient = useQueryClient();
  const editing = Boolean(address);
  const { register, handleSubmit, reset, setValue, watch, setError, formState } = useForm({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (!open) return;
    if (address) {
      const [lng, lat] = address.location.coordinates;
      reset({
        label: address.label,
        addressText: address.addressText,
        lng,
        lat,
        isDefault: address.isDefault,
      });
    } else {
      reset({ label: '', addressText: '', lng: undefined, lat: undefined, isDefault: false });
    }
  }, [open, address, reset]);

  const mutation = useMutation({
    mutationFn: (values) =>
      editing ? authApi.updateAddress(address._id, values) : authApi.addAddress(values),
    onSuccess: ({ addresses }) => {
      queryClient.setQueryData(queryKeys.addresses, { addresses });
      toast.success(editing ? 'Address updated' : 'Address saved');
      onClose();
    },
    onError: (err) => {
      if (!applyFieldErrors(err, setError, ['label', 'addressText', 'lng', 'lat']))
        toast.error(err.message);
    },
  });

  const lng = watch('lng');
  const lat = watch('lat');
  const location = lng !== undefined && lat !== undefined ? { lng, lat } : null;

  return (
    <Modal
      open={open}
      onClose={mutation.isPending ? () => {} : onClose}
      title={editing ? 'Edit address' : 'Add an address'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit((v) => mutation.mutate(v))} loading={mutation.isPending}>
            {editing ? 'Save changes' : 'Save address'}
          </Button>
        </>
      }
    >
      <form className="space-y-4" noValidate onSubmit={handleSubmit((v) => mutation.mutate(v))}>
        <Input
          label="Label"
          required
          placeholder="Home, Office…"
          error={formState.errors.label?.message}
          {...register('label')}
        />
        <Input
          label="Address"
          required
          placeholder="Area, street, landmark"
          error={formState.errors.addressText?.message}
          {...register('addressText')}
        />
        <LocationPicker
          value={location}
          height="h-64"
          onChange={(p) => {
            setValue('lng', p.lng, { shouldValidate: true });
            setValue('lat', p.lat, { shouldValidate: true });
          }}
          error={formState.errors.lng?.message || formState.errors.lat?.message}
        />
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            {...register('isDefault')}
          />
          Use as my default address
        </label>
      </form>
    </Modal>
  );
}

export default function Addresses() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const query = useQuery({ queryKey: queryKeys.addresses, queryFn: authApi.listAddresses });
  const addresses = query.data?.addresses ?? [];

  const setDefault = useMutation({
    mutationFn: (id) => authApi.updateAddress(id, { isDefault: true }),
    onSuccess: ({ addresses: list }) => {
      queryClient.setQueryData(queryKeys.addresses, { addresses: list });
      toast.success('Default address updated');
    },
    onError: (err) => toast.error(err.message),
  });
  const remove = useMutation({
    mutationFn: (id) => authApi.deleteAddress(id),
    onSuccess: ({ addresses: list }) => {
      queryClient.setQueryData(queryKeys.addresses, { addresses: list });
      toast.success('Address deleted');
      setDeleting(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const openForm = (address = null) => {
    setEditing(address);
    setFormOpen(true);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Saved addresses</h1>
          <p className="mt-1 text-sm text-slate-600">Pick these quickly when you book a repair.</p>
        </div>
        <Button icon={Plus} onClick={() => openForm()} disabled={addresses.length >= 10}>
          Add address
        </Button>
      </div>

      <div className="mt-6">
        {query.isLoading && <SkeletonList count={2} className="h-20" />}
        {query.isError && <ErrorState error={query.error} onRetry={query.refetch} />}
        {query.data && addresses.length === 0 && (
          <EmptyState
            icon={Home}
            title="No saved addresses"
            description="Save your home or office to book faster next time."
            action={
              <Button icon={Plus} onClick={() => openForm()}>
                Add your first address
              </Button>
            }
          />
        )}
        <ul className="space-y-3">
          {addresses.map((a) => (
            <li key={a._id}>
              <Card className="flex flex-wrap items-center gap-4">
                <MapPin className="h-5 w-5 shrink-0 text-blue-600" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-semibold text-slate-900">
                    {a.label}
                    {a.isDefault && <Badge tone="blue">Default</Badge>}
                  </p>
                  <p className="truncate text-sm text-slate-600">{a.addressText}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!a.isDefault && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={Star}
                      loading={setDefault.isPending && setDefault.variables === a._id}
                      onClick={() => setDefault.mutate(a._id)}
                    >
                      Make default
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={Pencil}
                    onClick={() => openForm(a)}
                    aria-label={`Edit ${a.label}`}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="danger-outline"
                    size="sm"
                    icon={Trash2}
                    onClick={() => setDeleting(a)}
                    aria-label={`Delete ${a.label}`}
                  >
                    Delete
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
        {addresses.length >= 10 && (
          <p className="mt-3 text-xs text-slate-500">You can save up to 10 addresses.</p>
        )}
      </div>

      <AddressForm open={formOpen} onClose={() => setFormOpen(false)} address={editing} />
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title={`Delete “${deleting?.label ?? ''}”?`}
        description={deleting?.addressText}
        confirmLabel="Delete address"
        loading={remove.isPending}
        onConfirm={() => remove.mutate(deleting._id)}
      />
    </div>
  );
}
