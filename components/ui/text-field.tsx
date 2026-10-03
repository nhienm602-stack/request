import type { InputHTMLAttributes, Ref } from "react";
import { cn } from "@/lib/cn";
import { FieldShell, controlBorder, controlClassName } from "./field-shell";

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  /** React 19 passes refs as ordinary props — no `forwardRef` needed. */
  ref?: Ref<HTMLInputElement>;
}

export function TextField({
  id,
  label,
  hint,
  error,
  required,
  className,
  ref,
  ...props
}: TextFieldProps) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required}>
      {(aria) => (
        <input
          {...aria}
          {...props}
          ref={ref}
          // `required` is intentionally not forwarded to the DOM: native browser
          // validation bubbles would compete with, and visually overlap, the
          // schema-driven messages. `aria-required` (set by FieldShell) carries
          // the semantics for assistive tech.
          className={cn(controlClassName, controlBorder(Boolean(error)), className)}
        />
      )}
    </FieldShell>
  );
}
