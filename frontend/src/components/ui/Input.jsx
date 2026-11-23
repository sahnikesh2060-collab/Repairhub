import { forwardRef, useId } from 'react';
import clsx from 'clsx';
import { Field, controlClass, describedBy } from './Field.jsx';

export const Input = forwardRef(function Input(
  { id, label, hint, error, counter, required, className, inputClassName, ...props },
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
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(inputId, { hint, error })}
        aria-required={required || undefined}
        className={clsx(controlClass(error), 'h-10', inputClassName)}
        {...props}
      />
    </Field>
  );
});

export default Input;
