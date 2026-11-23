import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, Briefcase, Phone } from 'lucide-react';
import * as techniciansApi from '../../api/technicians.api.js';
import { queryKeys } from '../../lib/queryKeys.js';
import { formatDate, formatMoney, pluralize } from '../../lib/format.js';
import { Avatar } from '../ui/Avatar.jsx';
import { Button } from '../ui/Button.jsx';
import { ErrorState } from '../ui/EmptyState.jsx';
import { Modal } from '../ui/Modal.jsx';
import { SkeletonList } from '../ui/Skeleton.jsx';
import { StarRating } from '../ui/StarRating.jsx';

function ProfileModal({ userId, open, onClose }) {
  const query = useQuery({
    queryKey: queryKeys.technicianPublic(userId),
    queryFn: () => techniciansApi.publicProfile(userId),
    enabled: open && Boolean(userId),
    staleTime: 60_000,
  });
  const t = query.data;
  return (
    <Modal open={open} onClose={onClose} title="Technician profile" size="md">
      {query.isLoading && <SkeletonList count={3} className="h-16" />}
      {query.isError && <ErrorState error={query.error} onRetry={query.refetch} />}
      {t && (
        <div className="space-y-5">
          <div className="flex items-center gap-4">
            <Avatar name={t.name} src={t.avatar} size="lg" />
            <div>
              <p className="flex items-center gap-1.5 text-lg font-semibold text-slate-900">
                {t.name}
                {t.isVerified && (
                  <BadgeCheck className="h-5 w-5 text-blue-600" aria-label="Verified" />
                )}
              </p>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <StarRating value={t.ratingAvg} size="sm" showValue />
                <span>({pluralize(t.ratingCount, 'review')})</span>
              </div>
            </div>
          </div>
          {t.bio && <p className="text-sm text-slate-700">{t.bio}</p>}
          <dl className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-slate-50 p-3">
              <dt className="text-xs text-slate-500">Experience</dt>
              <dd className="text-sm font-semibold text-slate-900">
                {pluralize(t.experienceYears, 'yr')}
              </dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <dt className="text-xs text-slate-500">Jobs done</dt>
              <dd className="text-sm font-semibold text-slate-900">{t.completedJobs}</dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <dt className="text-xs text-slate-500">Visit fee</dt>
              <dd className="text-sm font-semibold text-slate-900">{formatMoney(t.visitFee)}</dd>
            </div>
          </dl>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-900">Recent reviews</h3>
            {t.reviews.length === 0 ? (
              <p className="text-sm text-slate-500">No reviews yet.</p>
            ) : (
              <ul className="space-y-3">
                {t.reviews.map((r, i) => (
                  <li key={i} className="rounded-lg border border-slate-100 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <StarRating value={r.rating} size="sm" />
                      <span className="text-xs text-slate-400">
                        {r.customerName} · {formatDate(r.createdAt)}
                      </span>
                    </div>
                    {r.comment && <p className="mt-1.5 text-sm text-slate-700">{r.comment}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Avatar, name, stars, experience, jobs, visit fee, phone once revealed, and a profile modal. */
export function TechnicianSummaryCard({ technician }) {
  const [open, setOpen] = useState(false);
  if (!technician) return null;
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <Avatar name={technician.name} src={technician.avatar} size="lg" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-slate-900">{technician.name}</p>
        <div className="flex flex-wrap items-center gap-x-2 text-sm text-slate-600">
          <StarRating value={technician.ratingAvg ?? 0} size="sm" showValue />
          <span>({pluralize(technician.ratingCount ?? 0, 'review')})</span>
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Briefcase className="h-3.5 w-3.5" aria-hidden />
            {pluralize(technician.experienceYears ?? 0, 'year')} · {technician.completedJobs ?? 0}{' '}
            jobs done
          </span>
          <span>Visit fee {formatMoney(technician.visitFee)}</span>
        </p>
        {technician.phone && (
          <a
            href={`tel:${technician.phone}`}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md text-sm font-semibold text-blue-600 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <Phone className="h-4 w-4" aria-hidden /> {technician.phone}
          </a>
        )}
      </div>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        View profile
      </Button>
      <ProfileModal userId={technician._id} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

export default TechnicianSummaryCard;
