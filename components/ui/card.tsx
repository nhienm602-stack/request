import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/cn";

interface CardProps extends ComponentPropsWithoutRef<"div"> {
  children: ReactNode;
  as?: "div" | "section" | "aside";
}

export function Card({ children, className, as: Component = "div", ...props }: CardProps) {
  return (
    <Component
      // Remaining props are forwarded so a caller can attach the landmark's
      // accessible name (`aria-labelledby`). Swallowing them silently left the
      // summary panel as an unnamed region — invisible to a screen reader
      // navigating by landmark, and invisible to the tests that assert it.
      {...props}
      className={cn(
        "rounded-2xl border border-border-subtle bg-surface shadow-sm shadow-slate-900/[0.03]",
        className
      )}
    >
      {children}
    </Component>
  );
}
