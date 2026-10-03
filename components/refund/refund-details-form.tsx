"use client";

import { useEffect, useRef } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { SelectField } from "@/components/ui/select-field";
import { LiveRequestSummary } from "./live-request-summary";
import { COUNTRIES, findCountry } from "@/lib/refund/countries";
import {
  COUNTRY_DEPENDENT_FIELDS,
  EMPTY_REFUND_DETAILS,
  refundDetailsSchema,
  type RefundDetails,
  type RefundDetailsInput,
} from "@/lib/refund/details-schema";

interface RefundDetailsFormProps {
  defaultValues?: RefundDetailsInput;
  onSubmit: (details: RefundDetails) => void;
  stepLabel: string;
}

/**
 * Step 1 of the wizard.
 *
 * Owns the form; the summary panel is a sibling that subscribes to the same
 * `control`. Validation strategy is `onTouched` + `reValidateMode: "onChange"`:
 * a field is not marked wrong until the user has left it, but once it *is*
 * wrong the error clears the instant they fix it. Validating on every keystroke
 * from the start would flag every field as invalid while it is still being typed.
 */
export function RefundDetailsForm({
  defaultValues,
  onSubmit,
  stepLabel,
}: RefundDetailsFormProps) {
  const {
    register,
    handleSubmit,
    control,
    trigger,
    getValues,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<RefundDetailsInput, unknown, RefundDetails>({
    resolver: zodResolver(refundDetailsSchema),
    defaultValues: defaultValues ?? EMPTY_REFUND_DETAILS,
    mode: "onTouched",
    reValidateMode: "onChange",
  });

  // `useWatch` rather than `watch("country")`: `watch` returns a function that
  // cannot be memoized safely, which makes React Compiler skip optimising this
  // whole component. `useWatch` returns the value itself and subscribes only
  // this component to that one field.
  const country = useWatch({ control, name: "country" });
  const previousCountry = useRef(country);

  // Phone and ZIP rules are derived from the selected country, so changing the
  // country can turn a previously-valid value invalid, or clear a stale error.
  // Only fields the user has actually filled are re-checked — running `trigger`
  // across the board would surface "required" errors on empty fields they have
  // not reached yet.
  useEffect(() => {
    if (previousCountry.current === country) return;
    previousCountry.current = country;

    const filled = COUNTRY_DEPENDENT_FIELDS.filter((name) => getValues(name).trim() !== "");
    if (filled.length > 0) void trigger(filled);
  }, [country, getValues, trigger]);

  const selectedCountry = findCountry(country);

  /**
   * On a failed submit, move focus to the first field with an error. Without
   * this the user is left at the bottom of a nine-field form with no indication
   * of what went wrong above the fold.
   */
  const focusFirstError = (fieldErrors: typeof errors) => {
    const firstInvalid = FIELD_ORDER.find((name) => fieldErrors[name]);
    if (firstInvalid) setFocus(firstInvalid, { shouldSelect: true });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <form
        // `noValidate` hands validation entirely to the schema. Leaving native
        // validation on would show browser-styled bubbles that duplicate — and
        // sometimes contradict — our own messages.
        noValidate
        onSubmit={handleSubmit(onSubmit, focusFirstError)}
        className="rounded-2xl border border-border-subtle bg-surface p-5 shadow-sm shadow-slate-900/[0.03] sm:p-6"
      >
        <h1 className="text-xl font-semibold text-foreground">Request a refund</h1>
        <p className="mt-1 text-sm text-muted">
          Tell us about your order and how we can reach you. All fields are required.
        </p>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <TextField
            {...register("orderNumber")}
            id="orderNumber"
            label="Order number"
            required
            autoComplete="off"
            spellCheck={false}
            placeholder="e.g. ORD-48213"
            hint="Found at the top of your order confirmation email."
            error={errors.orderNumber?.message}
          />

          <TextField
            {...register("orderAmount")}
            id="orderAmount"
            label="Order amount (€)"
            required
            // `inputMode="decimal"` gives mobile users a numeric keypad while
            // keeping the control free text, so European decimal commas survive.
            inputMode="decimal"
            autoComplete="off"
            placeholder="e.g. 49,99"
            hint="The total you paid, in euros."
            error={errors.orderAmount?.message}
          />

          <TextField
            {...register("fullName")}
            id="fullName"
            label="Full name"
            required
            autoComplete="name"
            placeholder="e.g. Maria Rossi"
            error={errors.fullName?.message}
          />

          <TextField
            {...register("email")}
            id="email"
            label="Email"
            required
            type="email"
            autoComplete="email"
            spellCheck={false}
            placeholder="e.g. maria@example.com"
            hint="We will send your refund updates here."
            error={errors.email?.message}
          />

          <TextField
            {...register("phone")}
            id="phone"
            label="Phone number"
            required
            type="tel"
            autoComplete="tel"
            placeholder={selectedCountry ? "e.g. +49 30 1234567" : "Select a country first"}
            hint={
              selectedCountry
                ? `Enter a ${selectedCountry.name} number, or include the country code.`
                : "Choose your country below so we can check the format."
            }
            error={errors.phone?.message}
          />

          <TextField
            {...register("address")}
            id="address"
            label="Address"
            required
            autoComplete="street-address"
            placeholder="e.g. Via Roma 12"
            error={errors.address?.message}
          />

          <TextField
            {...register("city")}
            id="city"
            label="City"
            required
            autoComplete="address-level2"
            placeholder="e.g. Milano"
            error={errors.city?.message}
          />

          <TextField
            {...register("zipCode")}
            id="zipCode"
            label="ZIP code"
            required
            autoComplete="postal-code"
            spellCheck={false}
            placeholder={selectedCountry ? `e.g. ${selectedCountry.postalExample}` : "e.g. 20121"}
            hint={
              selectedCountry
                ? `${selectedCountry.name} format, for example ${selectedCountry.postalExample}.`
                : undefined
            }
            error={errors.zipCode?.message}
          />

          <SelectField
            {...register("country")}
            id="country"
            label="Country"
            required
            autoComplete="country"
            placeholder="Select a country"
            error={errors.country?.message}
            className="sm:col-span-2"
          >
            {COUNTRIES.map((option) => (
              <option key={option.code} value={option.code}>
                {option.name}
              </option>
            ))}
          </SelectField>
        </div>

        <div className="mt-7 flex justify-end border-t border-border-subtle pt-5">
          <Button type="submit" isLoading={isSubmitting} className="w-full sm:w-auto">
            Continue to verification
          </Button>
        </div>
      </form>

      {/* `lg:sticky` keeps the summary in view while the user works down a long
          form, without pinning it on small screens where it simply follows the
          form in reading order. */}
      <div className="lg:sticky lg:top-6">
        <LiveRequestSummary control={control} stepLabel={stepLabel} />
      </div>
    </div>
  );
}

/** Focus order for error recovery — matches the visual order of the fields. */
const FIELD_ORDER = [
  "orderNumber",
  "orderAmount",
  "fullName",
  "email",
  "phone",
  "address",
  "city",
  "zipCode",
  "country",
] as const satisfies readonly (keyof RefundDetailsInput)[];
