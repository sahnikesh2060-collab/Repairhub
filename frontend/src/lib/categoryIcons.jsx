import {
  AirVent,
  Bath,
  Brush,
  Camera,
  Car,
  Droplets,
  Fan,
  Flame,
  Hammer,
  Laptop,
  Lightbulb,
  Microwave,
  Monitor,
  PaintRoller,
  Plug,
  Printer,
  Refrigerator,
  ShowerHead,
  Smartphone,
  Sofa,
  Tv,
  WashingMachine,
  Wifi,
  Wrench,
  Zap,
} from 'lucide-react';

/**
 * Categories store a lucide-react icon name. Only the names below are bundled (importing every
 * icon would add ~600 kB); unknown names fall back to Wrench.
 */
export const CATEGORY_ICONS = Object.freeze({
  AirVent,
  Bath,
  Brush,
  Camera,
  Car,
  Droplets,
  Fan,
  Flame,
  Hammer,
  Laptop,
  Lightbulb,
  Microwave,
  Monitor,
  PaintRoller,
  Plug,
  Printer,
  Refrigerator,
  ShowerHead,
  Smartphone,
  Sofa,
  Tv,
  WashingMachine,
  Wifi,
  Wrench,
  Zap,
});

const ICON_BY_KEY = {
  AC: 'AirVent',
  COMPUTER: 'Laptop',
  PLUMBING: 'Wrench',
  ELECTRICAL: 'Zap',
  APPLIANCE: 'Refrigerator',
  CARPENTRY: 'Hammer',
};

export function iconFor({ icon, key } = {}) {
  return CATEGORY_ICONS[icon] ?? CATEGORY_ICONS[ICON_BY_KEY[key]] ?? Wrench;
}

export function CategoryIcon({ icon, categoryKey, className = 'h-5 w-5' }) {
  const Icon = iconFor({ icon, key: categoryKey });
  return <Icon className={className} aria-hidden />;
}

/** Colour per category for icon tiles: [tile background + icon colour, ring]. */
const CATEGORY_TONES = {
  AC: 'bg-sky-50 text-sky-600 ring-sky-100',
  COMPUTER: 'bg-violet-50 text-violet-600 ring-violet-100',
  PLUMBING: 'bg-cyan-50 text-cyan-700 ring-cyan-100',
  ELECTRICAL: 'bg-amber-50 text-amber-600 ring-amber-100',
  APPLIANCE: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
  CARPENTRY: 'bg-orange-50 text-orange-600 ring-orange-100',
};
const FALLBACK_TONES = [
  'bg-rose-50 text-rose-600 ring-rose-100',
  'bg-indigo-50 text-indigo-600 ring-indigo-100',
  'bg-teal-50 text-teal-600 ring-teal-100',
  'bg-fuchsia-50 text-fuchsia-600 ring-fuchsia-100',
];

export function categoryTone(key = '') {
  if (CATEGORY_TONES[key]) return CATEGORY_TONES[key];
  const sum = [...key].reduce((s, ch) => s + ch.charCodeAt(0), 0);
  return FALLBACK_TONES[sum % FALLBACK_TONES.length];
}

/** A rounded, colour-coded icon tile for a category. */
export function CategoryBadgeIcon({ icon, categoryKey, size = 'md', className = '' }) {
  const sizes = { sm: 'p-2 rounded-xl', md: 'p-3 rounded-2xl', lg: 'p-3.5 rounded-2xl' };
  const iconSizes = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-7 w-7' };
  return (
    <span
      className={`inline-flex w-fit shrink-0 self-start ring-1 ${sizes[size]} ${categoryTone(categoryKey)} ${className}`}
    >
      <CategoryIcon icon={icon} categoryKey={categoryKey} className={iconSizes[size]} />
    </span>
  );
}
