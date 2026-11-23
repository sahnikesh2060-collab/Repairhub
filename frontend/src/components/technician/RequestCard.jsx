import clsx from 'clsx';
import { Camera, MapPin, Zap } from 'lucide-react';
import { CategoryBadgeIcon } from '../../lib/categoryIcons.jsx';
import { formatDistance, relativeTime } from '../../lib/format.js';
import { Badge } from '../ui/Badge.jsx';
import { Button } from '../ui/Button.jsx';

/** An open request near the technician (from nearby-requests or new_repair_request). */
export function RequestCard({ request, categoryIcon, onOpen, now }) {
  return (
    <article
      className={clsx(
        'rounded-2xl border bg-white p-4 shadow-(--shadow-soft) transition hover:shadow-(--shadow-lift) sm:p-5',
        request.isNew ? 'border-blue-300 ring-4 ring-blue-100' : 'border-slate-200/80',
      )}
      aria-label={request.title}
    >
      <div className="flex items-start gap-3">
        <CategoryBadgeIcon icon={categoryIcon} categoryKey={request.category} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {request.isNew && <Badge tone="blue">New</Badge>}
            {request.urgency === 'URGENT' && (
              <Badge tone="red">
                <Zap className="h-3 w-3" aria-hidden /> Urgent
              </Badge>
            )}
            <span className="text-xs text-slate-400">{relativeTime(request.createdAt, now)}</span>
          </div>
          <h3 className="mt-1 font-semibold text-slate-900">{request.title}</h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-4 w-4 text-slate-400" aria-hidden />
              {request.area || 'Nearby'} · {formatDistance(request.distanceKm)}
            </span>
            {request.imagesCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <Camera className="h-4 w-4 text-slate-400" aria-hidden />
                {request.imagesCount} photo{request.imagesCount === 1 ? '' : 's'}
              </span>
            )}
          </p>
        </div>
        <Button size="sm" onClick={() => onOpen(request)}>
          View & Accept
        </Button>
      </div>
    </article>
  );
}

export default RequestCard;
