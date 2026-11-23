import clsx from 'clsx';

const TONES = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
  blue: 'bg-blue-50 text-blue-800 ring-blue-200',
  green: 'bg-green-50 text-green-800 ring-green-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-red-50 text-red-800 ring-red-200',
  violet: 'bg-violet-50 text-violet-800 ring-violet-200',
};

/** Always carries text, so colour is never the only signal. */
export function Badge({ tone = 'neutral', className, dotClassName, children }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset',
        TONES[tone] ?? tone,
        className,
      )}
    >
      {dotClassName && (
        <span className={clsx('h-1.5 w-1.5 rounded-full', dotClassName)} aria-hidden />
      )}
      {children}
    </span>
  );
}

export default Badge;
