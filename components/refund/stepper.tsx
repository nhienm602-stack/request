import { cn } from "@/lib/cn";
import { CheckIcon } from "@/components/ui/icons";

export interface Step {
  readonly id: string;
  readonly label: string;
}

/**
 * Progress indicator.
 *
 * Rendered as an ordered list inside a labelled `nav` so the sequence and the
 * current position are conveyed structurally, not only by colour.
 */
export function Stepper({
  steps,
  currentIndex,
}: {
  steps: readonly Step[];
  currentIndex: number;
}) {
  return (
    <nav aria-label="Refund request progress">
      <ol className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {steps.map((step, index) => {
          const isComplete = index < currentIndex;
          const isCurrent = index === currentIndex;
          return (
            <li key={step.id} className="flex items-center gap-3">
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                    isComplete && "border-success bg-success text-white",
                    isCurrent && "border-primary bg-primary text-primary-foreground",
                    !isComplete && !isCurrent && "border-border-strong bg-surface text-muted"
                  )}
                >
                  {isComplete ? <CheckIcon className="size-4" /> : index + 1}
                </span>
                <span
                  // Redundant with the styling above, but it is what a screen
                  // reader announces to locate the user in the flow.
                  aria-current={isCurrent ? "step" : undefined}
                  className={cn(
                    "text-sm font-medium",
                    isCurrent ? "text-foreground" : "text-muted"
                  )}
                >
                  {step.label}
                </span>
              </span>
              {index < steps.length - 1 ? (
                <span aria-hidden="true" className="h-px w-8 bg-border-strong sm:w-12" />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
