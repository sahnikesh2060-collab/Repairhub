import clsx from 'clsx';

export const controlClass = (error) =>
  clsx(
    'block w-full rounded-xl border bg-white px-3.5 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 transition-colors hover:border-slate-400',
    'focus:outline-none focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500',
    'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500',
    error ? 'border-red-400 focus:ring-red-500/15 focus:border-red-500' : 'border-slate-300',
  );

/** Label, hint, character counter and error message around a form control. */
export function Field({ id, label, hint, error, counter, required, className, children }) {
  return (
    <div className={className}>
      {label && (
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <label htmlFor={id} className="text-sm font-medium text-slate-700">
            {label}
            {required && (
              <span className="text-red-600" aria-hidden>
                {' '}
                *
              </span>
            )}
          </label>
          {counter && (
            <span
              className={clsx(
                'text-xs tabular-nums',
                counter.value > counter.max ? 'text-red-600' : 'text-slate-400',
              )}
              aria-live="polite"
            >
              {counter.value}/{counter.max}
            </span>
          )}
        </div>
      )}
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-xs font-medium text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export const describedBy = (id, { hint, error }) =>
  [error ? `${id}-error` : null, hint && !error ? `${id}-hint` : null].filter(Boolean).join(' ') ||
  undefined;
