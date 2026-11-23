import { Badge } from '../ui/Badge.jsx';
import { STATUS } from '../../lib/constants.js';

/** Status colour plus a text label (colour is never the only signal). */
export function StatusBadge({ status, className }) {
  const meta = STATUS[status] ?? { label: status, badge: 'neutral', dot: 'bg-slate-400' };
  return (
    <Badge tone={meta.badge} dotClassName={meta.dot} className={className}>
      {meta.label}
    </Badge>
  );
}

export default StatusBadge;
