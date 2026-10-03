import type { ReactNode, Ref, SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { FieldShell, controlBorder, controlClassName } from "./field-shell";

interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  placeholder?: string;
  children: ReactNode;
  ref?: Ref<HTMLSelectElement>;
}

export function SelectField({
  id,
  label,
  hint,
  error,
  placeholder,
  required,
  className,
  children,
  ref,
  ...props
}: SelectFieldProps) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required}>
      {(aria) => (
        <select
          {...aria}
          {...props}
          ref={ref}
          className={cn(controlClassName, controlBorder(Boolean(error)), "pr-8", className)}
        >
          {placeholder ? (
            // `value=""` keeps the placeholder a real, selectable-but-invalid
            // state so the schema can report it as missing.
            <option value="">{placeholder}</option>
          ) : null}
          {children}
        </select>
      )}
    </FieldShell>
  );
}
