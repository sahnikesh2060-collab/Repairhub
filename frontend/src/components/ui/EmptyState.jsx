import clsx from 'clsx';
import { AlertTriangle } from 'lucide-react';
import { Button } from './Button.jsx';

export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div
      className={clsx(
        'flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 py-12 text-center',
        className,
      )}
    >
      {Icon && (
        <span className="mb-4 rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100 p-4 text-blue-600 ring-1 ring-blue-100">
          <Icon className="h-6 w-6" aria-hidden />
        </span>
      )}
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Standard error state with a retry button. */
export function ErrorState({ error, onRetry, title = 'Something went wrong' }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center rounded-xl border border-red-200 bg-red-50 px-6 py-8 text-center"
    >
      <AlertTriangle className="mb-2 h-6 w-6 text-red-600" aria-hidden />
      <h3 className="text-base font-semibold text-red-900">{title}</h3>
      <p className="mt-1 text-sm text-red-700">{error?.message ?? 'Please try again.'}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={() => onRetry()}>
          Try again
        </Button>
      )}
    </div>
  );
}

export default EmptyState;
