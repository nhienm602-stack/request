"use client";

import { useWatch, type Control } from "react-hook-form";
import { RequestSummary } from "./request-summary";
import { buildSummaryEntries } from "@/lib/refund/summary-fields";
import type { RefundDetailsInput } from "@/lib/refund/details-schema";

/**
 * Connects the summary panel to live form state.
 *
 * `useWatch` subscribes *this* component to value changes rather than the form
 * root, so a keystroke re-renders the panel alone — the nine inputs are
 * untouched. Watching the whole form via `watch()` instead would re-render the
 * entire step on every character.
 */
export function LiveRequestSummary({
  control,
  stepLabel,
}: {
  control: Control<RefundDetailsInput>;
  stepLabel: string;
}) {
  const values = useWatch({ control });
  return <RequestSummary stepLabel={stepLabel} entries={buildSummaryEntries(values)} />;
}
