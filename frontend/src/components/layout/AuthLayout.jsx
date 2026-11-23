import { BadgeCheck, BellRing, Navigation, Star, Wrench } from 'lucide-react';

const POINTS = [
  {
    icon: BellRing,
    title: 'Nearby pros, instantly',
    text: 'Requests go only to verified technicians within reach.',
  },
  {
    icon: Navigation,
    title: 'Track them live',
    text: 'See your technician on the map with an arrival estimate.',
  },
  {
    icon: Star,
    title: 'Honest reviews',
    text: 'Every completed job can be rated by the customer.',
  },
];

/** Sign-in / sign-up layout: a branded panel beside the form on large screens. */
export function AuthLayout({ title, subtitle, children }) {
  return (
    <div className="mx-auto grid min-h-[calc(100vh-8rem)] max-w-6xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-2 lg:py-14">
      <aside className="rh-brand-gradient relative hidden overflow-hidden rounded-3xl p-10 text-white shadow-(--shadow-lift) lg:flex lg:flex-col lg:justify-between">
        <div className="rh-dots pointer-events-none absolute inset-0 opacity-20" />
        <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold ring-1 ring-white/25">
            <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Kathmandu Valley
          </span>
          <h2 className="mt-6 text-3xl font-extrabold leading-tight">
            Repairs you can follow, from request to review.
          </h2>
        </div>
        <ul className="relative mt-10 space-y-5">
          {POINTS.map((p) => (
            <li key={p.title} className="flex gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
                <p.icon className="h-5 w-5" aria-hidden />
              </span>
              <span>
                <span className="block font-bold">{p.title}</span>
                <span className="block text-sm text-blue-50">{p.text}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="relative mt-10 flex items-center gap-2 text-sm text-blue-100">
          <Wrench className="h-4 w-4" aria-hidden /> AC, computers, plumbing, electrical, appliances
          and carpentry.
        </p>
      </aside>

      <div className="flex flex-col justify-center">
        <div className="mx-auto w-full max-w-md">
          <h1 className="text-3xl font-extrabold text-slate-900">{title}</h1>
          {subtitle && <p className="mt-2 text-slate-600">{subtitle}</p>}
          {children}
        </div>
      </div>
    </div>
  );
}

export default AuthLayout;
