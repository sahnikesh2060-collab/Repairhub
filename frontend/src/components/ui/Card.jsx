import clsx from 'clsx';

export function Card({ as: Component = 'div', className, padded = true, children, ...props }) {
  return (
    <Component
      className={clsx(
        'rounded-2xl border border-slate-200/80 bg-white shadow-(--shadow-soft)',
        padded && 'p-5 sm:p-6',
        className,
      )}
      {...props}
    >
      {children}
    </Component>
  );
}

export function CardHeader({ title, description, actions, className, as: Heading = 'h2' }) {
  return (
    <div className={clsx('mb-4 flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <Heading className="text-base font-bold text-slate-900">{title}</Heading>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export default Card;
