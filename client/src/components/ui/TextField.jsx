import { forwardRef, useId } from "react";

/**
 * Labelled input with hint and inline error wired to aria-describedby / aria-invalid.
 * `ltr` keeps emails, phones and codes left-to-right inside the RTL layout.
 */
const TextField = forwardRef(function TextField(
  { label, hint, error, ltr = false, trailing, className = "", inputClassName = "", as = "input", id, ...props },
  ref
) {
  const autoId = useId();
  const inputId = id || autoId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = error ? errorId : hint ? hintId : undefined;
  const Control = as;

  return (
    <div className={`field ${className}`}>
      {label && (
        <label htmlFor={inputId} className="field-label">
          {label}
        </label>
      )}
      <div className="relative">
        <Control
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          dir={ltr ? "ltr" : undefined}
          className={`input ${ltr ? "input-ltr" : ""} ${trailing ? "pe-12" : ""} ${inputClassName}`}
          {...props}
        />
        {trailing}
      </div>
      {error && (
        <span id={errorId} className="field-error" role="alert">
          {error}
        </span>
      )}
      {hint && !error && (
        <span id={hintId} className="field-hint">
          {hint}
        </span>
      )}
    </div>
  );
});

export default TextField;
