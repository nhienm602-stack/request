import type { Route } from "next";
import type { Step } from "@/components/refund/stepper";

/**
 * The wizard's step manifest.
 *
 * Both the stepper and the summary panel's "Current step" label read from here,
 * so a step cannot be renamed in one place and stale in the other. `href` is
 * typed as `Route`, so `typedRoutes` fails the build if a step ever points at a
 * path that does not exist.
 */
export interface WizardStep extends Step {
  readonly href: Route;
}

export const WIZARD_STEPS = [
  { id: "details", label: "Order details", href: "/refund/details" },
  { id: "verification", label: "Verification", href: "/refund/verification" },
] as const satisfies readonly WizardStep[];

export type WizardStepId = (typeof WIZARD_STEPS)[number]["id"];

export function stepIndex(id: WizardStepId): number {
  return WIZARD_STEPS.findIndex((step) => step.id === id);
}

export function stepLabel(id: WizardStepId): string {
  return WIZARD_STEPS[stepIndex(id)].label;
}
