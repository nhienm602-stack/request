import { Card } from "@/components/ui/card";
import { Callout } from "@/components/ui/callout";
import { ShieldCheckIcon } from "@/components/ui/icons";
import type { SummaryEntry } from "@/lib/refund/summary-fields";

interface RequestSummaryProps {
  /** Name of the step the user is currently on, e.g. "Order details". */
  stepLabel: string;
  entries: readonly SummaryEntry[];
  /** Shown before the user has entered anything. */
  emptyMessage?: string;
}

/**
 * Presentational summary panel — no form or router coupling.
 *
 * Keeping this component free of `useFormContext` is what makes it reusable
 * across both steps: step 1 feeds it live keystrokes via `LiveRequestSummary`,
 * step 2 feeds it the already-validated details from the wizard. It is also
 * directly testable by passing an array.
 */
export function RequestSummary({
  stepLabel,
  entries,
  emptyMessage = "Your details will appear here as you fill in the form.",
}: RequestSummaryProps) {
  return (
    <Card as="aside" aria-labelledby="request-summary-heading" className="overflow-hidden">
      <div className="border-b border-border-subtle px-5 py-4">
        <h2 id="request-summary-heading" className="text-base font-semibold text-foreground">
          Request summary
        </h2>
      </div>

      <div className="px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Current step</p>
        <p className="mt-1 text-sm font-medium text-foreground">{stepLabel}</p>

        {entries.length === 0 ? (
          <p className="mt-4 text-sm text-muted">{emptyMessage}</p>
        ) : (
          /*
           * A description list is the correct semantic for label/value pairs,
           * and `aria-live="polite"` means rows are announced as they appear
           * without interrupting the user's typing.
           */
          <dl className="mt-4 space-y-3" aria-live="polite">
            {entries.map((entry) => (
              <div
                key={entry.name}
                className="flex items-baseline justify-between gap-4 border-b border-dashed border-border-subtle pb-3 last:border-b-0 last:pb-0"
              >
                <dt className="shrink-0 text-sm text-muted">{entry.label}</dt>
                {/* `break-all` keeps a long email from widening the panel. */}
                <dd className="min-w-0 break-all text-right text-sm font-semibold text-foreground">
                  {entry.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <div className="px-5 pb-5">
        <Callout tone="info" title="Secure processing" icon={<ShieldCheckIcon />}>
          Your information is encrypted and will be reviewed within 2–3 business days.
        </Callout>
      </div>
    </Card>
  );
}
