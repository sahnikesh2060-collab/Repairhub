import { useId, useState } from 'react';
import clsx from 'clsx';
import { Star } from 'lucide-react';

const LABELS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];
const SIZES = { sm: 'h-4 w-4', md: 'h-5 w-5', lg: 'h-8 w-8' };

/**
 * Read-only stars when `onChange` is absent; otherwise an accessible radio group
 * (arrow keys work natively).
 */
export function StarRating({
  value = 0,
  onChange,
  size = 'md',
  label = 'Rating',
  showValue = false,
}) {
  const name = useId();
  const [hover, setHover] = useState(0);

  if (!onChange) {
    const rounded = Math.round(value * 2) / 2;
    return (
      <span
        className="inline-flex items-center gap-1"
        aria-label={`${value.toFixed(1)} out of 5 stars`}
      >
        <span className="inline-flex" aria-hidden>
          {[1, 2, 3, 4, 5].map((n) => (
            <Star
              key={n}
              className={clsx(
                SIZES[size],
                n <= rounded ? 'fill-amber-400 text-amber-400' : 'fill-slate-200 text-slate-200',
              )}
            />
          ))}
        </span>
        {showValue && (
          <span className="text-sm font-semibold text-slate-700">{value.toFixed(1)}</span>
        )}
      </span>
    );
  }

  const shown = hover || value;
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-slate-700">{label}</legend>
      <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <label
            key={n}
            className="cursor-pointer rounded-md p-0.5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500"
            onMouseEnter={() => setHover(n)}
          >
            <input
              type="radio"
              name={name}
              value={n}
              checked={value === n}
              onChange={() => onChange(n)}
              className="sr-only"
            />
            <Star
              aria-hidden
              className={clsx(
                SIZES[size],
                'transition-colors',
                n <= shown ? 'fill-amber-400 text-amber-400' : 'fill-slate-200 text-slate-300',
              )}
            />
            <span className="sr-only">
              {n} star{n > 1 ? 's' : ''} ({LABELS[n]})
            </span>
          </label>
        ))}
        <span className="ml-2 text-sm text-slate-600" aria-live="polite">
          {LABELS[shown]}
        </span>
      </div>
    </fieldset>
  );
}

export default StarRating;
