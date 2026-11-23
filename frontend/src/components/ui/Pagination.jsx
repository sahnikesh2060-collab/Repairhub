import { Button } from './Button.jsx';

/** Previous / next pager for server-side pagination meta { page, totalPages, total }. */
export function Pagination({ meta, onChange }) {
  if (!meta || meta.totalPages <= 1) return null;
  return (
    <nav className="mt-4 flex items-center justify-between gap-3" aria-label="Pagination">
      <Button
        variant="secondary"
        size="sm"
        disabled={meta.page <= 1}
        onClick={() => onChange(meta.page - 1)}
      >
        Previous
      </Button>
      <span className="text-sm text-slate-600">
        Page {meta.page} of {meta.totalPages}
        {meta.total !== undefined && <span className="text-slate-400"> · {meta.total} total</span>}
      </span>
      <Button
        variant="secondary"
        size="sm"
        disabled={meta.page >= meta.totalPages}
        onClick={() => onChange(meta.page + 1)}
      >
        Next
      </Button>
    </nav>
  );
}

export default Pagination;
