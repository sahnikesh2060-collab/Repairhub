import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { ArrowLeft, ArrowRight, Check, Home, Send, Zap } from 'lucide-react';
import * as authApi from '../../api/auth.api.js';
import * as bookingsApi from '../../api/bookings.api.js';
import * as categoriesApi from '../../api/categories.api.js';
import { applyFieldErrors } from '../../api/client.js';
import { CategoryIcon } from '../../lib/categoryIcons.jsx';
import { formatFriendlyDateTime } from '../../lib/format.js';
import { queryKeys } from '../../lib/queryKeys.js';
import { LocationPicker } from '../../components/map/LocationPicker.jsx';
import { PhotoUploader } from '../../components/booking/PhotoUploader.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { ErrorState } from '../../components/ui/EmptyState.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { Textarea } from '../../components/ui/Textarea.jsx';

// Mirrors backend/src/validators/booking.schemas.js.
const schema = z
  .object({
    category: z.string().min(1, 'Choose a category'),
    title: z.string().trim().min(5, 'At least 5 characters').max(120, 'At most 120 characters'),
    description: z
      .string()
      .trim()
      .min(10, 'At least 10 characters')
      .max(2000, 'At most 2000 characters'),
    urgency: z.enum(['NORMAL', 'URGENT']),
    lng: z
      .number({
        required_error: 'Pick the repair location',
        invalid_type_error: 'Pick the repair location',
      })
      .min(-180)
      .max(180),
    lat: z
      .number({
        required_error: 'Pick the repair location',
        invalid_type_error: 'Pick the repair location',
      })
      .min(-90)
      .max(90),
    addressText: z
      .string()
      .trim()
      .min(3, 'Describe the address')
      .max(300, 'At most 300 characters'),
    preferredDate: z.string().optional(),
    preferredFromTime: z.string().optional(),
    preferredToTime: z.string().optional(),
    preferredNote: z.string().max(300, 'At most 300 characters').optional(),
  })
  .superRefine((v, ctx) => {
    const anyTime = v.preferredFromTime || v.preferredToTime;
    if (anyTime && !v.preferredDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['preferredDate'],
        message: 'Pick a date for your time window',
      });
    }
    if (v.preferredDate && (!v.preferredFromTime || !v.preferredToTime)) {
      ctx.addIssue({
        code: 'custom',
        path: ['preferredToTime'],
        message: 'Give both a start and an end time',
      });
    }
    if (v.preferredFromTime && v.preferredToTime && v.preferredToTime <= v.preferredFromTime) {
      ctx.addIssue({
        code: 'custom',
        path: ['preferredToTime'],
        message: 'End time must be after the start time',
      });
    }
  });

const STEP_FIELDS = [
  ['category', 'title', 'description', 'urgency'],
  ['lng', 'lat', 'addressText'],
  ['preferredDate', 'preferredFromTime', 'preferredToTime', 'preferredNote'],
];
const STEP_TITLES = ['The problem', 'Location', 'Timing & review'];
const SERVER_FIELDS = [
  'category',
  'title',
  'description',
  'lng',
  'lat',
  'addressText',
  'preferredNote',
  'urgency',
];

const localIso = (date, time) => new Date(`${date}T${time}`).toISOString();
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function StepIndicator({ step }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Booking steps">
      {STEP_TITLES.map((title, i) => {
        const done = i < step;
        const current = i === step;
        return (
          <li
            key={title}
            className="flex flex-1 items-center gap-2"
            aria-current={current ? 'step' : undefined}
          >
            <span
              className={clsx(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                done && 'bg-blue-600 text-white',
                current && 'bg-blue-50 text-blue-700 ring-2 ring-blue-600',
                !done && !current && 'bg-slate-100 text-slate-400',
              )}
            >
              {done ? <Check className="h-4 w-4" aria-hidden /> : i + 1}
            </span>
            <span
              className={clsx(
                'hidden text-sm font-medium sm:block',
                current ? 'text-slate-900' : 'text-slate-500',
              )}
            >
              {title}
            </span>
            {i < STEP_TITLES.length - 1 && (
              <span className="h-0.5 flex-1 bg-slate-200" aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
  );
}

export default function NewBooking() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const [step, setStep] = useState(0);
  const [photos, setPhotos] = useState([]);
  const [chosenAddressId, setChosenAddressId] = useState(null);

  const categories = useQuery({
    queryKey: queryKeys.categories,
    queryFn: categoriesApi.listCategories,
    staleTime: 5 * 60_000,
  });
  const addresses = useQuery({ queryKey: queryKeys.addresses, queryFn: authApi.listAddresses });

  const form = useForm({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      category: (params.get('category') ?? '').toUpperCase(),
      title: '',
      description: '',
      urgency: 'NORMAL',
      lng: undefined,
      lat: undefined,
      addressText: '',
      preferredDate: '',
      preferredFromTime: '',
      preferredToTime: '',
      preferredNote: '',
    },
  });
  const { register, watch, setValue, trigger, handleSubmit, setError, formState } = form;
  const { errors } = formState;
  const values = watch();

  const selectAddress = (a) => {
    setChosenAddressId(a._id);
    const [lng, lat] = a.location.coordinates;
    setValue('lng', lng, { shouldValidate: true });
    setValue('lat', lat, { shouldValidate: true });
    setValue('addressText', a.addressText, { shouldValidate: true });
  };

  // Start from the default saved address, if there is one.
  useEffect(() => {
    const list = addresses.data?.addresses ?? [];
    const def = list.find((a) => a.isDefault);
    if (def && form.getValues('lng') === undefined) selectAddress(def);
    // selectAddress only uses stable form setters
  }, [addresses.data]);

  const mutation = useMutation({
    mutationFn: (fd) => bookingsApi.createBooking(fd),
    onSuccess: ({ booking, matchedCount }) => {
      queryClient.setQueryData(queryKeys.booking(booking._id), booking);
      queryClient.invalidateQueries({ queryKey: queryKeys.bookingsAll });
      toast.success(
        matchedCount > 0
          ? `Request sent to ${matchedCount} nearby technician${matchedCount === 1 ? '' : 's'}`
          : "No technicians nearby yet. We'll keep looking.",
        { duration: 6000 },
      );
      navigate(`/customer/bookings/${booking._id}`, { replace: true });
    },
    onError: (err) => {
      const matched = applyFieldErrors(err, setError, SERVER_FIELDS);
      toast.error(matched ? 'Please fix the highlighted fields.' : err.message);
      if (matched) {
        const firstBad = STEP_FIELDS.findIndex((fields) =>
          err.details?.some((d) => fields.includes(d.field)),
        );
        if (firstBad >= 0) setStep(firstBad);
      }
    },
  });

  const next = async () => {
    const ok = await trigger(STEP_FIELDS[step]);
    if (ok) setStep((s) => s + 1);
  };

  const onSubmit = (v) => {
    const fd = new FormData();
    fd.append('category', v.category);
    fd.append('title', v.title.trim());
    fd.append('description', v.description.trim());
    fd.append('urgency', v.urgency);
    fd.append('lng', String(v.lng));
    fd.append('lat', String(v.lat));
    fd.append('addressText', v.addressText.trim());
    if (v.preferredDate && v.preferredFromTime && v.preferredToTime) {
      fd.append('preferredFrom', localIso(v.preferredDate, v.preferredFromTime));
      fd.append('preferredTo', localIso(v.preferredDate, v.preferredToTime));
    }
    if (v.preferredNote?.trim()) fd.append('preferredNote', v.preferredNote.trim());
    for (const file of photos) fd.append('images', file);
    mutation.mutate(fd);
  };

  const category = categories.data?.find((c) => c.key === values.category);
  const location =
    values.lng !== undefined && values.lat !== undefined
      ? { lng: values.lng, lat: values.lat }
      : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-slate-900">Book a repair</h1>
      <p className="mt-1 text-sm text-slate-600">
        Nearby verified technicians will be alerted as soon as you send it.
      </p>
      <div className="mt-6">
        <StepIndicator step={step} />
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-6 space-y-6">
        {step === 0 && (
          <Card className="space-y-6">
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-slate-700">
                Category{' '}
                <span className="text-red-600" aria-hidden>
                  *
                </span>
              </legend>
              {categories.isLoading && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {Array.from({ length: 6 }, (_, i) => (
                    <Skeleton key={i} className="h-20" />
                  ))}
                </div>
              )}
              {categories.isError && (
                <ErrorState error={categories.error} onRetry={categories.refetch} />
              )}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {categories.data?.map((c) => {
                  const selected = values.category === c.key;
                  return (
                    <button
                      key={c.key}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setValue('category', c.key, { shouldValidate: true })}
                      className={clsx(
                        'flex items-center gap-3 rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                        selected
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-slate-200 bg-white hover:border-slate-300',
                      )}
                    >
                      <CategoryIcon
                        icon={c.icon}
                        categoryKey={c.key}
                        className={clsx('h-6 w-6', selected ? 'text-blue-600' : 'text-slate-500')}
                      />
                      <span className="text-sm font-semibold text-slate-900">{c.name}</span>
                    </button>
                  );
                })}
              </div>
              {errors.category && (
                <p className="mt-1.5 text-xs font-medium text-red-600" role="alert">
                  {errors.category.message}
                </p>
              )}
            </fieldset>

            <Input
              label="Title"
              required
              placeholder="e.g. AC not cooling, rattling noise"
              counter={{ value: values.title.length, max: 120 }}
              error={errors.title?.message}
              {...register('title')}
            />
            <Textarea
              label="Describe the problem"
              required
              rows={5}
              placeholder="What happens, since when, brand or model if you know it…"
              counter={{ value: values.description.length, max: 2000 }}
              error={errors.description?.message}
              {...register('description')}
            />

            <fieldset>
              <legend className="mb-2 text-sm font-medium text-slate-700">How urgent is it?</legend>
              <div className="inline-flex rounded-lg bg-slate-100 p-1">
                {[
                  { id: 'NORMAL', label: 'Normal' },
                  { id: 'URGENT', label: 'Urgent', icon: Zap },
                ].map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    aria-pressed={values.urgency === u.id}
                    onClick={() => setValue('urgency', u.id)}
                    className={clsx(
                      'inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                      values.urgency === u.id
                        ? u.id === 'URGENT'
                          ? 'bg-red-600 text-white'
                          : 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600',
                    )}
                  >
                    {u.icon && <u.icon className="h-4 w-4" aria-hidden />}
                    {u.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <PhotoUploader files={photos} onChange={setPhotos} />
          </Card>
        )}

        {step === 1 && (
          <Card className="space-y-6">
            {(addresses.data?.addresses?.length ?? 0) > 0 && (
              <fieldset>
                <legend className="mb-2 text-sm font-medium text-slate-700">
                  Use a saved address
                </legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {addresses.data.addresses.map((a) => (
                    <button
                      key={a._id}
                      type="button"
                      aria-pressed={chosenAddressId === a._id}
                      onClick={() => selectAddress(a)}
                      className={clsx(
                        'flex items-start gap-3 rounded-xl border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                        chosenAddressId === a._id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-slate-200 hover:border-slate-300',
                      )}
                    >
                      <Home className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                      <span>
                        <span className="block text-sm font-semibold text-slate-900">
                          {a.label}{' '}
                          {a.isDefault && (
                            <span className="text-xs font-normal text-slate-500">(default)</span>
                          )}
                        </span>
                        <span className="block text-xs text-slate-500">{a.addressText}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">
                Repair location{' '}
                <span className="text-red-600" aria-hidden>
                  *
                </span>
              </p>
              <LocationPicker
                value={location}
                onChange={(p) => {
                  setChosenAddressId(null);
                  setValue('lng', p.lng, { shouldValidate: true });
                  setValue('lat', p.lat, { shouldValidate: true });
                }}
                error={errors.lng?.message || errors.lat?.message}
              />
            </div>
            <Input
              label="Address"
              required
              placeholder="Area, street, landmark (e.g. New Baneshwor, near Everest Hotel)"
              hint="Technicians see only the first part (the area) until you confirm a booking."
              counter={{ value: values.addressText.length, max: 300 }}
              error={errors.addressText?.message}
              {...register('addressText')}
            />
          </Card>
        )}

        {step === 2 && (
          <>
            <Card className="space-y-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Preferred time (optional)
                </h2>
                <p className="text-sm text-slate-500">
                  Technicians will try to propose a time in this window.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <Input
                  label="Date"
                  type="date"
                  min={todayLocal()}
                  error={errors.preferredDate?.message}
                  {...register('preferredDate')}
                />
                <Input
                  label="From"
                  type="time"
                  error={errors.preferredFromTime?.message}
                  {...register('preferredFromTime')}
                />
                <Input
                  label="To"
                  type="time"
                  error={errors.preferredToTime?.message}
                  {...register('preferredToTime')}
                />
              </div>
              <Input
                label="Note about timing"
                placeholder="e.g. Weekdays after 5 PM"
                counter={{ value: values.preferredNote?.length ?? 0, max: 300 }}
                error={errors.preferredNote?.message}
                {...register('preferredNote')}
              />
            </Card>

            <Card>
              <h2 className="text-base font-semibold text-slate-900">Review</h2>
              <dl className="mt-4 divide-y divide-slate-100 text-sm">
                {[
                  ['Category', category?.name ?? values.category],
                  ['Title', values.title],
                  ['Urgency', values.urgency === 'URGENT' ? 'Urgent' : 'Normal'],
                  ['Photos', photos.length ? `${photos.length} attached` : 'None'],
                  ['Address', values.addressText],
                  ['Coordinates', location ? `lat ${location.lat}, lng ${location.lng}` : '—'],
                  [
                    'Preferred window',
                    values.preferredDate && values.preferredFromTime && values.preferredToTime
                      ? `${formatFriendlyDateTime(localIso(values.preferredDate, values.preferredFromTime))} – ${values.preferredToTime}`
                      : 'Any time',
                  ],
                ].map(([label, value]) => (
                  <div key={label} className="flex gap-4 py-2">
                    <dt className="w-36 shrink-0 text-slate-500">{label}</dt>
                    <dd className="min-w-0 break-words font-medium text-slate-900">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-sm text-slate-600">{values.description}</p>
            </Card>
          </>
        )}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          {step > 0 ? (
            <Button
              variant="secondary"
              icon={ArrowLeft}
              onClick={() => setStep((s) => s - 1)}
              disabled={mutation.isPending}
            >
              Back
            </Button>
          ) : (
            <span />
          )}
          {/* Distinct keys: React must not turn the clicked "Continue" <button> into the
              submit button mid-click, or the browser submits the form right away. */}
          {step < 2 ? (
            <Button key="continue" iconRight={ArrowRight} onClick={next}>
              Continue
            </Button>
          ) : (
            <Button key="submit" type="submit" size="lg" icon={Send} loading={mutation.isPending}>
              Send request
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
