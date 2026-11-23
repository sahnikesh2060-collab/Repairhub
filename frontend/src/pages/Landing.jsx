import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BadgeCheck,
  BellRing,
  CalendarCheck,
  Check,
  Clock,
  MapPin,
  MessageCircle,
  Navigation,
  ShieldCheck,
  Star,
  Wrench,
} from 'lucide-react';
import * as categoriesApi from '../api/categories.api.js';
import { useAuth } from '../hooks/useAuth.js';
import { CategoryBadgeIcon } from '../lib/categoryIcons.jsx';
import { ROLE_HOME } from '../lib/constants.js';
import { queryKeys } from '../lib/queryKeys.js';
import { Button } from '../components/ui/Button.jsx';
import { ErrorState } from '../components/ui/EmptyState.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';

const STEPS = [
  {
    icon: MapPin,
    title: 'Describe the problem',
    text: 'Pick a category, add a few photos and drop a pin where the repair is needed.',
  },
  {
    icon: BellRing,
    title: 'Nearby pros are alerted',
    text: 'Verified technicians within reach get your request instantly and propose a time.',
  },
  {
    icon: CalendarCheck,
    title: 'Confirm and track',
    text: 'Accept a time, follow them live on the map, chat, and review when it is done.',
  },
];

const PROMISES = [
  { icon: BadgeCheck, text: 'Admin-verified technicians' },
  { icon: Navigation, text: 'Live tracking to your door' },
  { icon: Star, text: 'Reviews after every job' },
];

/** A static product preview: the tracker a customer sees once a technician is on the way. */
function HeroPreview() {
  const steps = ['Request sent', 'Time proposed', 'Confirmed', 'On the way'];
  return (
    <div className="relative mx-auto w-full max-w-md" aria-hidden>
      <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-tr from-blue-200/60 via-sky-100/40 to-violet-200/50 blur-2xl" />
      <div className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-(--shadow-lift) backdrop-blur">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono text-[11px] font-semibold text-slate-400">REP-2026-1042</p>
            <p className="mt-0.5 font-bold text-slate-900">AC not cooling, rattling noise</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-200">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-600" />
            On the way
          </span>
        </div>

        <ol className="mt-5 grid grid-cols-4 gap-2">
          {steps.map((s, i) => (
            <li key={s} className="flex flex-col items-center gap-1.5 text-center">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                  i < 3 ? 'bg-blue-600 text-white' : 'bg-white text-blue-700 ring-2 ring-blue-600'
                }`}
              >
                {i < 3 ? <Check className="h-3.5 w-3.5" /> : 4}
              </span>
              <span className="text-[10px] font-semibold leading-tight text-slate-600">{s}</span>
            </li>
          ))}
        </ol>

        <div className="relative mt-5 h-36 overflow-hidden rounded-2xl bg-gradient-to-br from-sky-50 to-blue-100">
          <div className="rh-dots absolute inset-0 opacity-70" />
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 300 140" fill="none">
            <path
              d="M30 110 C 90 100, 110 40, 170 55 S 250 40, 270 28"
              stroke="#2563eb"
              strokeWidth="3"
              strokeDasharray="6 6"
              strokeLinecap="round"
            />
          </svg>
          <span className="absolute left-[8%] top-[68%] h-4 w-4 rounded-full border-2 border-white bg-indigo-600 shadow" />
          <span className="absolute right-[7%] top-[12%] flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-md">
            <MapPin className="h-4 w-4 text-red-500" />
          </span>
          <span className="absolute bottom-3 right-3 rounded-full bg-white/95 px-3 py-1 text-xs font-bold text-slate-800 shadow">
            About 8 min away
          </span>
        </div>

        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
            BS
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-900">Bikash Shrestha</p>
            <p className="flex items-center gap-1 text-xs text-slate-500">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" /> 4.9 · 8 years · AC
              specialist
            </p>
          </div>
          <span className="rounded-xl bg-white p-2 text-blue-600 shadow-sm ring-1 ring-slate-200">
            <MessageCircle className="h-4 w-4" />
          </span>
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  const { user, role } = useAuth();
  const categories = useQuery({
    queryKey: queryKeys.categories,
    queryFn: categoriesApi.listCategories,
    staleTime: 5 * 60_000,
  });
  let bookHref = '/register';
  if (user) bookHref = role === 'customer' ? '/customer/bookings/new' : ROLE_HOME[role];
  const categoryHref = (key) =>
    role === 'customer' ? `/customer/bookings/new?category=${key}` : bookHref;

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-blue-50/80 via-white to-slate-50">
        <div className="rh-dots pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_70%)]" />
        <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-blue-300/30 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pb-24 lg:pt-20">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 shadow-sm ring-1 ring-blue-100">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Verified technicians across the
              Kathmandu Valley
            </p>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
              Home repairs,
              <br />
              <span className="bg-gradient-to-r from-blue-600 to-sky-500 bg-clip-text text-transparent">
                sorted in minutes.
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
              AC not cooling? Laptop won&apos;t boot? Describe the problem and a nearby, verified
              technician proposes a time. Follow them live on the map until the job is done.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button as={Link} to={bookHref} size="lg" icon={Wrench} iconRight={ArrowRight}>
                Book a repair
              </Button>
              {!user && (
                <Button as={Link} to="/register?role=technician" size="lg" variant="secondary">
                  Join as a technician
                </Button>
              )}
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
              {PROMISES.map((p) => (
                <li
                  key={p.text}
                  className="flex items-center gap-2 text-sm font-medium text-slate-600"
                >
                  <p.icon className="h-4 w-4 text-blue-600" aria-hidden />
                  {p.text}
                </li>
              ))}
            </ul>
          </div>
          <HeroPreview />
        </div>
      </section>

      {/* Categories */}
      <section
        className="mx-auto max-w-6xl px-4 py-16 sm:px-6"
        aria-labelledby="categories-heading"
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-blue-600">Services</p>
            <h2 id="categories-heading" className="mt-1 text-3xl font-extrabold text-slate-900">
              What needs fixing?
            </h2>
          </div>
          <Link
            to={bookHref}
            className="inline-flex items-center gap-1 rounded-md text-sm font-semibold text-blue-600 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Start a request <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {categories.isLoading &&
            Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}
          {categories.data?.map((c) => (
            <Link
              key={c.key}
              to={categoryHref(c.key)}
              className="group flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-(--shadow-soft) transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-(--shadow-lift) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <CategoryBadgeIcon icon={c.icon} categoryKey={c.key} />
              <div>
                <p className="flex items-center justify-between font-bold text-slate-900">
                  {c.name}
                  <ArrowRight
                    className="h-4 w-4 -translate-x-1 text-slate-300 opacity-0 transition group-hover:translate-x-0 group-hover:text-blue-600 group-hover:opacity-100"
                    aria-hidden
                  />
                </p>
                {c.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-slate-500">{c.description}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
        {categories.isError && (
          <div className="mt-4">
            <ErrorState
              error={categories.error}
              onRetry={categories.refetch}
              title="Could not load categories"
            />
          </div>
        )}
        {categories.data?.length === 0 && (
          <p className="mt-4 text-sm text-slate-500">No categories yet. Run the seed script.</p>
        )}
      </section>

      {/* How it works */}
      <section className="border-y border-slate-200/70 bg-white" aria-labelledby="how-heading">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <p className="text-sm font-bold uppercase tracking-wider text-blue-600">How it works</p>
          <h2 id="how-heading" className="mt-1 text-3xl font-extrabold text-slate-900">
            From problem to fixed in three steps
          </h2>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li
                key={s.title}
                className="relative rounded-2xl border border-slate-200/80 bg-slate-50/60 p-6"
              >
                <span className="absolute right-5 top-4 text-5xl font-extrabold text-slate-200/80">
                  {i + 1}
                </span>
                <span className="rh-brand-gradient flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-(--shadow-brand)">
                  <s.icon className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="mt-5 text-lg font-bold text-slate-900">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Technician band */}
      {!user && (
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="rh-brand-gradient relative overflow-hidden rounded-3xl px-6 py-10 text-white shadow-(--shadow-lift) sm:px-10">
            <div className="rh-dots absolute inset-0 opacity-20" />
            <div className="relative grid items-center gap-8 lg:grid-cols-[1.4fr_1fr]">
              <div>
                <h2 className="text-2xl font-extrabold sm:text-3xl">Are you a technician?</h2>
                <p className="mt-2 max-w-xl text-blue-50">
                  Get repair jobs near you, set your own radius and visit fee, and build your
                  reputation with every review.
                </p>
                <ul className="mt-5 grid gap-2 text-sm text-blue-50 sm:grid-cols-2">
                  {[
                    'Jobs only within your radius',
                    'Propose times that suit you',
                    'Directions with one tap',
                    'Track your earnings',
                  ].map((t) => (
                    <li key={t} className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-white" aria-hidden /> {t}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-col items-start gap-3 lg:items-end">
                <Button
                  as={Link}
                  to="/register?role=technician"
                  size="lg"
                  variant="secondary"
                  iconRight={ArrowRight}
                >
                  Join as a technician
                </Button>
                <p className="flex items-center gap-1.5 text-xs text-blue-100">
                  <Clock className="h-3.5 w-3.5" aria-hidden /> An admin verifies your account
                  before your first job
                </p>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
