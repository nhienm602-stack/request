import type { Metadata } from "next";
import { Stepper } from "@/components/refund/stepper";
import { WIZARD_STEPS, stepIndex } from "@/lib/refund/steps";
import { DetailsStep } from "./details-step";

export const metadata: Metadata = {
  title: "Order details · Request a refund",
  description:
    "Tell us about your order so we can start your refund request. Reviewed within 2–3 business days.",
};

/**
 * Step 1 route.
 *
 * A Server Component that renders the static chrome and hands off only the
 * interactive form to the client, so the stepper and headings ship as HTML.
 */
export default function DetailsPage() {
  return (
    <div className="flex flex-col gap-8">
      <Stepper steps={WIZARD_STEPS} currentIndex={stepIndex("details")} />
      <DetailsStep />
    </div>
  );
}
