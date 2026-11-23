import clsx from 'clsx';

export function Skeleton({ className }) {
  return (
    <div className={clsx('animate-pulse rounded-lg bg-slate-200/80', className)} aria-hidden />
  );
}

/** A list placeholder of `count` card-shaped skeletons. */
export function SkeletonList({ count = 3, className = 'h-24' }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className={className} />
      ))}
    </div>
  );
}

export default Skeleton;
