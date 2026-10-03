import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** Renders a spinner and blocks interaction without collapsing the layout. */
  isLoading?: boolean;
  children: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-primary text-primary-foreground hover:bg-primary-hover disabled:bg-primary/50",
  secondary:
    "bg-surface text-foreground border border-border-strong hover:bg-surface-muted disabled:opacity-60",
  ghost: "text-primary hover:bg-primary-subtle disabled:opacity-60",
};

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold " +
  "transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring " +
  "disabled:cursor-not-allowed";

/**
 * Button styling as a plain class string.
 *
 * Lets a `<Link>` adopt the button look without wrapping an anchor in a
 * `<button>` — that nesting is invalid HTML and produces an element that is
 * announced twice and behaves unpredictably under keyboard activation.
 */
export function buttonClassName(variant: Variant = "primary", className?: string): string {
  return cn(BASE, VARIANTS[variant], className);
}

export function Button({
  variant = "primary",
  isLoading = false,
  className,
  disabled,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      // Kept focusable while loading so a screen-reader user is not thrown to
      // the top of the document mid-submit.
      aria-busy={isLoading || undefined}
      disabled={disabled || isLoading}
      className={buttonClassName(variant, className)}
      {...props}
    >
      {isLoading ? <Spinner /> : null}
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <svg
      className="size-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
      <path
        d="M4 12a8 8 0 0 1 8-8"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        className="opacity-90"
      />
    </svg>
  );
}
