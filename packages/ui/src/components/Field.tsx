import type { ReactNode } from 'react';
import { useId } from 'react';
import { cn } from '../lib/cn';
import { OctagonExclamationIcon } from './icons';
import { Label } from './Label';

/** Props the Field hands to the control so the wiring is impossible to forget. */
export interface FieldControlProps {
  id: string;
  'aria-describedby': string | undefined;
  'aria-invalid': true | undefined;
  'aria-required': true | undefined;
}

export interface FieldProps {
  label: ReactNode;
  /** Hint text, announced with the control through `aria-describedby`. */
  description?: ReactNode;
  /** Validation message. Presence flips the control to `aria-invalid`. */
  error?: ReactNode;
  required?: boolean;
  /** Control id. Generated with `useId()` when omitted. */
  id?: string;
  className?: string;
  children: (controlProps: FieldControlProps) => ReactNode;
}

/**
 * Label + control + description + error, wired for assistive technology.
 *
 * `children` is a render prop because the control is not known here: the field
 * owns the ids, so the caller cannot forget `aria-describedby` or
 * `aria-invalid`.
 *
 * The error message keeps its text in `--color-text` and carries the severity
 * hue on a glyph instead — see the note in `Badge.tsx` on why severity colour
 * is not used as a text colour.
 */
export function Field({
  label,
  description,
  error,
  required = false,
  id,
  className,
  children,
}: FieldProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const descriptionId = `${controlId}-description`;
  const errorId = `${controlId}-error`;

  const hasError = error !== undefined && error !== null && error !== '';
  const describedBy =
    [description ? descriptionId : null, hasError ? errorId : null].filter(Boolean).join(' ') ||
    undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={controlId}>
        {label}
        {required ? (
          <span aria-hidden className="ml-0.5 text-critical">
            *
          </span>
        ) : null}
      </Label>

      {children({
        id: controlId,
        'aria-describedby': describedBy,
        'aria-invalid': hasError ? true : undefined,
        'aria-required': required ? true : undefined,
      })}

      {description ? (
        <p id={descriptionId} className="text-xs text-text-muted">
          {description}
        </p>
      ) : null}

      {hasError ? (
        <p
          id={errorId}
          role="alert"
          className="flex items-start gap-1 text-xs font-medium text-text"
        >
          <OctagonExclamationIcon className="mt-px h-3 w-3 shrink-0 text-critical" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
