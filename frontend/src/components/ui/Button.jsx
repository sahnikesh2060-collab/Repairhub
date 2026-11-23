import { forwardRef } from 'react';
import clsx from 'clsx';
import { Spinner } from './Spinner.jsx';

const VARIANTS = {
  primary:
    'bg-blue-600 text-white shadow-(--shadow-brand) hover:bg-blue-700 hover:-translate-y-px disabled:bg-blue-300 disabled:shadow-none disabled:translate-y-0',
  secondary:
    'bg-white text-slate-800 shadow-sm ring-1 ring-inset ring-slate-200 hover:bg-slate-50 hover:ring-slate-300 disabled:text-slate-400',
  ghost: 'text-slate-700 hover:bg-slate-100 disabled:text-slate-400',
  danger:
    'bg-red-600 text-white shadow-[0_8px_20px_-6px_rgb(220_38_38/0.45)] hover:bg-red-700 disabled:bg-red-300 disabled:shadow-none',
  'danger-outline':
    'bg-white text-red-700 ring-1 ring-inset ring-red-200 hover:bg-red-50 disabled:text-red-300',
};

const SIZES = {
  sm: 'h-8 gap-1.5 px-3 text-sm',
  md: 'h-10 gap-2 px-4 text-sm',
  lg: 'h-12 gap-2 px-6 text-[15px]',
};

/**
 * A real <button> (or `as={Link}`). `loading` shows a spinner, disables it and sets aria-busy.
 */
export const Button = forwardRef(function Button(
  {
    as: Component = 'button',
    variant = 'primary',
    size = 'md',
    loading = false,
    icon: Icon,
    iconRight: IconRight,
    fullWidth = false,
    className,
    children,
    disabled,
    type,
    ...props
  },
  ref,
) {
  const isButton = Component === 'button';
  return (
    <Component
      ref={ref}
      type={isButton ? (type ?? 'button') : undefined}
      disabled={isButton ? disabled || loading : undefined}
      aria-disabled={!isButton && (disabled || loading) ? true : undefined}
      aria-busy={loading || undefined}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded-xl font-semibold transition-all duration-150 active:scale-[0.98]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {loading ? (
        <Spinner size="sm" label="Working" />
      ) : (
        Icon && <Icon className="h-4 w-4" aria-hidden />
      )}
      {children}
      {IconRight && !loading && <IconRight className="h-4 w-4" aria-hidden />}
    </Component>
  );
});

export default Button;
