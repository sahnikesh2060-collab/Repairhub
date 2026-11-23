import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import * as categoriesApi from '../../api/categories.api.js';
import * as techniciansApi from '../../api/technicians.api.js';
import { applyFieldErrors } from '../../api/client.js';
import { CategoryIcon } from '../../lib/categoryIcons.jsx';
import { queryKeys } from '../../lib/queryKeys.js';
import { Button } from '../ui/Button.jsx';
import { ErrorState } from '../ui/EmptyState.jsx';
import { Input } from '../ui/Input.jsx';
import { Skeleton } from '../ui/Skeleton.jsx';
import { Textarea } from '../ui/Textarea.jsx';

// Mirrors PUT /technicians/me/profile validation.
const schema = z.object({
  categories: z.array(z.string()).min(1, 'Choose at least one category').max(10),
  bio: z.string().trim().max(500, 'At most 500 characters'),
  experienceYears: z.coerce.number().int('Whole years only').min(0).max(60, 'At most 60 years'),
  visitFee: z.coerce.number().int('Whole currency units only').min(0).max(1_000_000),
  serviceRadiusKm: z.coerce.number().min(1).max(50),
});

const defaultsFrom = (profile) => ({
  categories: profile?.categories ?? [],
  bio: profile?.bio ?? '',
  experienceYears: profile?.experienceYears ?? 0,
  visitFee: profile?.visitFee ?? 500,
  serviceRadiusKm: profile?.serviceRadiusKm ?? 10,
});

/** Categories, bio, experience, visit fee and service radius (onboarding and profile page). */
export function TechnicianProfileForm({ profile, onSaved, submitLabel = 'Save profile' }) {
  const queryClient = useQueryClient();
  const categories = useQuery({
    queryKey: queryKeys.categories,
    queryFn: categoriesApi.listCategories,
    staleTime: 5 * 60_000,
  });

  const { register, handleSubmit, watch, setValue, reset, setError, formState } = useForm({
    resolver: zodResolver(schema),
    defaultValues: defaultsFrom(profile),
  });
  const profileVersion = `${profile?._id}-${profile?.updatedAt}`;
  useEffect(() => {
    reset(defaultsFrom(profile));
    // Only when a different saved profile arrives.
  }, [profileVersion]); // eslint-disable-line

  const mutation = useMutation({
    mutationFn: techniciansApi.updateProfile,
    onSuccess: (result) => {
      queryClient.setQueryData(queryKeys.technicianMe, (old) => ({ ...(old ?? {}), ...result }));
      toast.success('Profile saved');
      onSaved?.(result);
    },
    onError: (err) => {
      const fields = ['categories', 'bio', 'experienceYears', 'visitFee', 'serviceRadiusKm'];
      if (!applyFieldErrors(err, setError, fields)) toast.error(err.message);
    },
  });

  const selected = watch('categories');
  const radius = watch('serviceRadiusKm');
  const bio = watch('bio') ?? '';
  const toggle = (key) =>
    setValue(
      'categories',
      selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key],
      { shouldValidate: true, shouldDirty: true },
    );

  return (
    <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-6" noValidate>
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-slate-700">
          Services you offer{' '}
          <span className="text-red-600" aria-hidden>
            *
          </span>
        </legend>
        {categories.isLoading && <Skeleton className="h-24" />}
        {categories.isError && <ErrorState error={categories.error} onRetry={categories.refetch} />}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {categories.data?.map((c) => {
            const on = selected.includes(c.key);
            return (
              <button
                key={c.key}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(c.key)}
                className={clsx(
                  'flex items-center gap-2 rounded-xl border p-3 text-left text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                  on
                    ? 'border-blue-500 bg-blue-50 text-blue-900'
                    : 'border-slate-200 text-slate-700',
                )}
              >
                <CategoryIcon
                  icon={c.icon}
                  categoryKey={c.key}
                  className={clsx('h-5 w-5', on ? 'text-blue-600' : 'text-slate-400')}
                />
                {c.name}
              </button>
            );
          })}
        </div>
        {formState.errors.categories && (
          <p className="mt-1.5 text-xs font-medium text-red-600" role="alert">
            {formState.errors.categories.message}
          </p>
        )}
      </fieldset>

      <Textarea
        label="About you"
        rows={3}
        placeholder="Your experience, brands you know, tools you carry…"
        counter={{ value: bio.length, max: 500 }}
        error={formState.errors.bio?.message}
        {...register('bio')}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Years of experience"
          type="number"
          min={0}
          max={60}
          inputMode="numeric"
          required
          error={formState.errors.experienceYears?.message}
          {...register('experienceYears')}
        />
        <Input
          label="Visit fee (NPR)"
          type="number"
          min={0}
          inputMode="numeric"
          required
          hint="Charged for coming out; your default estimate."
          error={formState.errors.visitFee?.message}
          {...register('visitFee')}
        />
      </div>

      <div>
        <label htmlFor="radius" className="flex justify-between text-sm font-medium text-slate-700">
          <span>Service radius</span>
          <span className="tabular-nums text-blue-700">{radius} km</span>
        </label>
        <input
          id="radius"
          type="range"
          min={1}
          max={50}
          step={1}
          className="mt-2 w-full accent-blue-600"
          aria-valuetext={`${radius} kilometres`}
          {...register('serviceRadiusKm')}
        />
        <p className="mt-1 text-xs text-slate-500">
          You will only be notified about requests within this distance of your location.
        </p>
      </div>

      <Button type="submit" size="lg" loading={mutation.isPending}>
        {submitLabel}
      </Button>
    </form>
  );
}

export default TechnicianProfileForm;
