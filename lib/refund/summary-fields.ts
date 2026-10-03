/**
 * The ordered field manifest that drives the Request summary panel.
 *
 * The requirement is that the summary always lists entries in *form order*,
 * regardless of the order the user actually filled them in. Deriving that order
 * from a single exported array — rather than from insertion order, or from a
 * second hand-maintained list inside the panel — means the two can never drift.
 * Reordering the form is a matter of reordering this array, and
 * `summary-fields.test.ts` asserts the manifest stays in sync with the schema.
 */
import { findCountry } from "./countries";
import { formatEuro, parseOrderAmount } from "./amount";
import type { RefundDetailsInput } from "./details-schema";

export type RefundDetailsField = keyof RefundDetailsInput;

export interface SummaryField {
  readonly name: RefundDetailsField;
  readonly label: string;
  /**
   * Renders the raw input for display, or returns `null` when the value is not
   * yet worth showing (empty, or not yet parseable). Returning `null` keeps a
   * half-typed amount from flashing as a malformed currency string.
   */
  readonly format: (value: string) => string | null;
}

const trimmed = (value: string): string | null => {
  const next = value.trim();
  return next === "" ? null : next;
};

/** Order here === order of the fields in RefundDetailsForm. */
export const SUMMARY_FIELDS: readonly SummaryField[] = [
  { name: "orderNumber", label: "Order number", format: (v) => trimmed(v)?.toUpperCase() ?? null },
  {
    name: "orderAmount",
    label: "Order amount",
    format: (value) => {
      if (trimmed(value) === null) return null;
      const result = parseOrderAmount(value);
      // While the user is mid-keystroke ("49,"), show the raw text rather than
      // either a wrong number or a distracting gap.
      return result.ok ? formatEuro(result.value) : value.trim();
    },
  },
  { name: "fullName", label: "Full name", format: trimmed },
  { name: "email", label: "Email", format: trimmed },
  { name: "phone", label: "Phone number", format: trimmed },
  { name: "address", label: "Address", format: trimmed },
  { name: "city", label: "City", format: trimmed },
  { name: "zipCode", label: "ZIP code", format: trimmed },
  {
    name: "country",
    label: "Country",
    format: (value) => findCountry(value)?.name ?? null,
  },
];

export interface SummaryEntry {
  readonly name: RefundDetailsField;
  readonly label: string;
  readonly value: string;
}

/**
 * Projects the current form values onto the manifest, dropping anything not
 * yet worth showing. Pure and synchronous, so it is trivially unit-testable
 * without rendering the panel.
 */
export function buildSummaryEntries(
  values: Partial<Record<RefundDetailsField, string | undefined>>
): SummaryEntry[] {
  const entries: SummaryEntry[] = [];
  for (const field of SUMMARY_FIELDS) {
    const raw = values[field.name];
    if (typeof raw !== "string") continue;
    const formatted = field.format(raw);
    if (formatted === null) continue;
    entries.push({ name: field.name, label: field.label, value: formatted });
  }
  return entries;
}
