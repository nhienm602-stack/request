/**
 * Step 1 — order details.
 *
 * This schema is the single source of truth for the rules. It runs twice:
 *   - in the browser via `zodResolver`, for immediate field-level feedback;
 *   - inside the Server Action, because the client is not a trust boundary.
 *
 * Client-side validation here is a UX affordance, never a security control.
 */
import { z } from "zod";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { COUNTRY_CODES, findCountry } from "./countries";
import { MAX_ORDER_AMOUNT, MIN_ORDER_AMOUNT, parseOrderAmount } from "./amount";

/** Letters (any script), spaces, hyphens, apostrophes and periods. */
const NAME_CHARS = /^[\p{L}\p{M}'’.\- ]+$/u;

export const refundDetailsSchema = z
  .object({
    orderNumber: z
      .string()
      .trim()
      .min(1, "Order number is required.")
      .max(32, "Order number must be 32 characters or fewer.")
      .regex(
        /^[A-Za-z0-9][A-Za-z0-9-]{3,}$/,
        "Enter the order number exactly as it appears on your receipt (letters, numbers and hyphens)."
      )
      // Order numbers are case-insensitive references; store one canonical form.
      .transform((value) => value.toUpperCase()),

    // Kept as a string through validation so the user's own formatting survives
    // round-trips; `parsedAmount` below carries the numeric value.
    orderAmount: z
      .string()
      .trim()
      .min(1, "Order amount is required.")
      .superRefine((value, ctx) => {
        const result = parseOrderAmount(value);
        if (result.ok) return;
        const message =
          result.reason === "too-many-decimals"
            ? "Use at most two decimal places, for example 49,99."
            : result.reason === "out-of-range"
              ? `Enter an amount between €${MIN_ORDER_AMOUNT.toFixed(2)} and €${MAX_ORDER_AMOUNT.toLocaleString("de-DE")}.`
              : "Enter a valid amount, for example 49,99.";
        ctx.addIssue({ code: "custom", message });
      }),

    fullName: z
      .string()
      .trim()
      .min(2, "Full name is required.")
      .max(80, "Full name must be 80 characters or fewer.")
      .regex(NAME_CHARS, "Full name may only contain letters, spaces, hyphens and apostrophes.")
      .refine(
        (value) => value.split(/\s+/).filter(Boolean).length >= 2,
        "Enter both your first and last name."
      ),

    email: z
      .string()
      .trim()
      .min(1, "Email address is required.")
      .max(254, "Email address must be 254 characters or fewer.")
      .pipe(z.email("Enter a valid email address, for example name@example.com."))
      .transform((value) => value.toLowerCase()),

    // Validated against `country` in the object-level refinement below, because
    // what counts as a valid number depends on the region.
    phone: z.string().trim().min(1, "Phone number is required."),

    address: z
      .string()
      .trim()
      .min(5, "Enter your full street address, including the house or flat number.")
      .max(120, "Address must be 120 characters or fewer."),

    city: z
      .string()
      .trim()
      .min(2, "City is required.")
      .max(60, "City must be 60 characters or fewer.")
      .regex(NAME_CHARS, "City may only contain letters, spaces, hyphens and apostrophes."),

    // Also country-dependent — see the refinement below.
    zipCode: z.string().trim().min(1, "ZIP / postal code is required."),

    country: z.enum(COUNTRY_CODES, { error: "Select your country." }),
  })
  .superRefine((values, ctx) => {
    const country = findCountry(values.country);
    // `country` already failed its own check; skip the dependent rules rather
    // than reporting a second, confusing error on phone and ZIP.
    if (!country) return;

    const phoneNumber = parsePhoneNumberFromString(values.phone, country.code);
    if (!phoneNumber?.isValid()) {
      ctx.addIssue({
        code: "custom",
        path: ["phone"],
        message: `Enter a valid ${country.name} phone number, or include the international prefix (for example +49 …).`,
      });
    }

    if (!country.postalCode.test(values.zipCode)) {
      ctx.addIssue({
        code: "custom",
        path: ["zipCode"],
        message: `Enter a valid ${country.name} postal code, for example ${country.postalExample}.`,
      });
    }
  });

/** Raw shape as the form holds it — every field a string. */
export type RefundDetailsInput = z.input<typeof refundDetailsSchema>;
/** Validated, normalised shape. */
export type RefundDetails = z.output<typeof refundDetailsSchema>;

/** Fields that depend on `country` and must be re-validated when it changes. */
export const COUNTRY_DEPENDENT_FIELDS = ["phone", "zipCode"] as const;

export const EMPTY_REFUND_DETAILS: RefundDetailsInput = {
  orderNumber: "",
  orderAmount: "",
  fullName: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  zipCode: "",
  country: "" as RefundDetailsInput["country"],
};
