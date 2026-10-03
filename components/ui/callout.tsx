import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "info" | "danger" | "success";

const TONES: Record<Tone, string> = {
  info: "bg-primary-subtle border-primary-border text-foreground",
  danger: "bg-danger-subtle border-danger-border text-foreground",
  success: "bg-success-subtle border-success-border text-foreground",
};

const ICON_TONES: Record<Tone, string> = {
  info: "text-primary",
  danger: "text-danger",
  success: "text-success",
};

interface CalloutProps {
  tone?: Tone;
  title?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  /**
   * Set for messages that appear in response to a user action, so assistive
   * tech announces them. Static advisory text should leave this off to avoid
   * noisy announcements on page load.
   */
  role?: "alert" | "status";
}

export function Callout({
  tone = "info",
  title,
  icon,
  children,
  className,
  role,
}: CalloutProps) {
  return (
    <div role={role} className={cn("rounded-xl border p-4", TONES[tone], className)}>
      <div className="flex gap-3">
        {icon ? (
          <span className={cn("mt-0.5 shrink-0", ICON_TONES[tone])} aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0 text-sm">
          {title ? <p className="font-semibold">{title}</p> : null}
          <div className={cn(title ? "mt-1" : undefined, "text-muted")}>{children}</div>
        </div>
      </div>
    </div>
  );
}
