import type { ReactNode } from "react";

export interface FieldAria {
  id: string;
  "aria-describedby": string | undefined;
  "aria-invalid": true | undefined;
  "aria-required": true | undefined;
}

interface FieldShellProps {
  id: string;
  label: string;
  /** Guidance shown before the user makes a mistake, not after. */
  hint?: string;
  error?: string;
  required?: boolean;
  children: (aria: FieldAria) => ReactNode;
}

/**
 * The single place that wires up label/description/error relationships.
 *
 * Every accessible-name and description association in the app flows through
 * here, so a control cannot accidentally ship without its error announced. The
 * render-prop shape lets inputs, selects and file pickers share it without the
 * shell needing to know which control it wraps.
 */
export function FieldShell({
  id,
  label,
  hint,
  error,
  required = false,
  children,
}: FieldShellProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  // Error first: screen readers read descriptions in order, and the correction
  // is more urgent than the hint.
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
        {required ? (
          <>
            <span aria-hidden="true" className="ml-0.5 text-danger">
              *
            </span>
            <span className="sr-only"> (required)</span>
          </>
        ) : null}
      </label>

      {children({
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
        "aria-required": required || undefined,
      })}

      {hint ? (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}

      {error ? (
        // `role="alert"` announces the message as soon as it appears, which is
        // what makes on-blur validation usable without sight.
        <p id={errorId} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Shared control styling so inputs and selects stay visually identical. */
export const controlClassName =
  "w-full rounded-lg border bg-surface px-3 py-2.5 text-sm text-foreground " +
  "placeholder:text-muted/70 transition-colors " +
  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring " +
  "disabled:cursor-not-allowed disabled:bg-surface-muted";

export function controlBorder(hasError: boolean): string {
  return hasError ? "border-danger-border bg-danger-subtle" : "border-border-strong";
}
