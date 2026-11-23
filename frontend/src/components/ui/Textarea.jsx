import { forwardRef, useId } from 'react';
import clsx from 'clsx';
import { Field, controlClass, describedBy } from './Field.jsx';

export const Textarea = forwardRef(function Textarea(
  { id, label, hint, error, counter, required, className, rows = 4, ...props },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <Field
      id={inputId}
      label={label}
      hint={hint}
      error={error}
      counter={counter}
      required={required}
      className={className}
    >
      <textarea
        ref={ref}
        id={inputId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(inputId, { hint, error })}
        aria-required={required || undefined}
        className={clsx(controlClass(error), 'resize-y')}
        {...props}
      />
    </Field>
  );
});

export default Textarea;
