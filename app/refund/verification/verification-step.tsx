"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { VerificationForm } from "@/components/refund/verification-form";
import { RequestSummary } from "@/components/refund/request-summary";
import { FormSkeleton } from "@/components/refund/form-skeleton";
import { useRefundWizard } from "@/hooks/use-refund-wizard";
import { buildSummaryEntries } from "@/lib/refund/summary-fields";
import { stepLabel } from "@/lib/refund/steps";

/**
 * Client half of step 2.
 *
 * Guards the route: step 2 is meaningless without step 1's data, so a user who
 * deep-links here, or whose session draft has expired, is sent back rather than
 * shown a form that can only fail on submit.
 */
export function VerificationStep() {
  const router = useRouter();
  const { status, details, isComplete, complete } = useRefundWizard();

  // `isComplete` keeps the guard quiet during the hand-off to the confirmation
  // page. Completing the flow clears the details, which would otherwise look
  // identical to arriving here with none and bounce the user back to step 1.
  const isMissingDetails = status === "ready" && details === null && !isComplete;

  useEffect(() => {
    // `replace`, not `push`: the incomplete step 2 should not sit in history,
    // or "Back" from step 1 would bounce the user straight into it again.
    if (isMissingDetails) router.replace("/refund/details");
  }, [isMissingDetails, router]);

  // Covers both the pre-hydration frame and the moment between deciding to
  // redirect and the navigation committing.
  if (status === "loading" || details === null) return <FormSkeleton />;

  const handleSubmitted = (reference: string) => {
    // The draft has been accepted server-side; clearing it prevents a stale
    // request being resubmitted from a stale tab.
    complete();
    router.replace(`/refund/success?reference=${encodeURIComponent(reference)}`);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <VerificationForm details={details} onSubmitted={handleSubmitted} />
      <div className="lg:sticky lg:top-6">
        {/*
          The same panel as step 1, now fed the frozen, validated details
          instead of live keystrokes — which is exactly why it takes entries as
          a prop rather than reaching into form state itself.
        */}
        <RequestSummary
          stepLabel={stepLabel("verification")}
          entries={buildSummaryEntries(details)}
        />
      </div>
    </div>
  );
}
