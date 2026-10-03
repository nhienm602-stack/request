"use client";

import { useRouter } from "next/navigation";
import { RefundDetailsForm } from "@/components/refund/refund-details-form";
import { FormSkeleton } from "@/components/refund/form-skeleton";
import { useRefundWizard } from "@/hooks/use-refund-wizard";
import { stepLabel } from "@/lib/refund/steps";
import type { RefundDetails, RefundDetailsInput } from "@/lib/refund/details-schema";

/**
 * Client half of step 1: wires the form to wizard state and to navigation.
 *
 * Kept separate from `page.tsx` so the `"use client"` boundary sits as deep in
 * the tree as it usefully can — the page, stepper and metadata stay on the
 * server.
 */
export function DetailsStep() {
  const router = useRouter();
  const { status, details, setDetails } = useRefundWizard();

  if (status === "loading") return <FormSkeleton />;

  const handleSubmit = (values: RefundDetails) => {
    setDetails(values);
    router.push("/refund/verification");
  };

  return (
    <RefundDetailsForm
      // Remounts the form once the saved draft arrives, so returning from step 2
      // (or refreshing) repopulates every field rather than showing a blank form
      // that RHF has already initialised.
      key={details ? "restored" : "blank"}
      defaultValues={details ? toFormValues(details) : undefined}
      onSubmit={handleSubmit}
      stepLabel={stepLabel("details")}
    />
  );
}

/**
 * The schema normalises values on the way in (trimming, upper-casing the order
 * number, lower-casing the email). Feeding the normalised output back to the
 * form is intentional — the user sees exactly the values that will be
 * submitted, with no surprise transformation at the end.
 */
function toFormValues(details: RefundDetails): RefundDetailsInput {
  return {
    orderNumber: details.orderNumber,
    orderAmount: details.orderAmount,
    fullName: details.fullName,
    email: details.email,
    phone: details.phone,
    address: details.address,
    city: details.city,
    zipCode: details.zipCode,
    country: details.country,
  };
}
