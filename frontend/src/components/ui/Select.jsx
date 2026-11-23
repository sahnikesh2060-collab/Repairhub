import { forwardRef, useId } from 'react';
import clsx from 'clsx';
import { Field, controlClass, describedBy } from './Field.jsx';

export const Select = forwardRef(function Select(
  { id, label, hint, error, required, className, children, ...props },
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
      required={required}
      className={className}
    >
      <select
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(inputId, { hint, error })}
        className={clsx(controlClass(error), 'h-10 pr-8')}
        {...props}
      >
        {children}
      </select>
    </Field>
  );
});

export default Select;
