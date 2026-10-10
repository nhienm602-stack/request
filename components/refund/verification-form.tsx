"use client";

import { useCallback, useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { Button, buttonClassName } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { InfoIcon } from "@/components/ui/icons";
import { PhotoField } from "./photo-field";
import { VideoSelfieField } from "./video-selfie-field";
import {
  EMPTY_VERIFICATION,
  verificationSchema,
  type Verification,
  type VerificationInput,
} from "@/lib/refund/verification-schema";
import { submitRefundRequest, type SubmitProgress } from "@/lib/refund/submit-refund-request";
import type { RefundDetails } from "@/lib/refund/details-schema";

interface VerificationFormProps {
  details: RefundDetails;
  onSubmitted: (reference: string) => void;
}

/**
 * Step 2 of the wizard.
 *
 * Submits to the internal endpoint (`POST /api/refund-requests`) via
 * `submitRefundRequest`, which owns the multipart assembly and response
 * parsing. The result drives client-side navigation and per-field error
 * placement, so it is handled here rather than through a `<form action>`
 * binding. `useTransition` keeps the pending state tied to React's scheduler so
 * the button reflects the real in-flight status, including the upload.
 */
export function VerificationForm({ details, onSubmitted }: VerificationFormProps) {
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  // Label for the current upload step, shown on the button while submitting.
  const [stepLabel, setStepLabel] = useState<string | null>(null);
  // Duration is checked asynchronously in the browser, outside the schema.
  const [durationError, setDurationError] = useState<string | null>(null);
  // Progress across the multi-request upload, so a retry resumes rather than
  // re-sending files that already reached the server. Held in state (not a ref)
  // so it is read from a fresh render on each attempt, never during render.
  const [progress, setProgress] = useState<SubmitProgress>({
    reference: null,
    uploadedSlots: [],
  });

  const {
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<VerificationInput, unknown, Verification>({
    resolver: zodResolver(verificationSchema),
    defaultValues: EMPTY_VERIFICATION,
    mode: "onTouched",
    reValidateMode: "onChange",
  });

  // Stable identity — `VideoSelfieField` calls this from an effect, and an
  // inline arrow would re-run that effect on every render of this form.
  const handleDurationIssue = useCallback((message: string | null) => {
    setDurationError(message);
  }, []);

  const onValid = (values: Verification) => {
    // The duration gate lives outside the schema, so `handleSubmit` cannot
    // enforce it. Surfacing a banner here matters: returning silently would
    // leave the user clicking a button that appears to do nothing.
    if (durationError !== null) {
      setFormError("Please replace the video selfie before submitting.");
      return;
    }
    setFormError(null);

    startTransition(async () => {
      const result = await submitRefundRequest(details, values, {
        progress,
        onStep: setStepLabel,
      });

      if (result.status === "success") {
        setProgress({ reference: null, uploadedSlots: [] });
        onSubmitted(result.reference);
        return;
      }

      // Remember what was delivered so a retry resumes from there.
      setProgress(result.progress);

      if (result.status === "invalid") {
        // Map server-side field errors back onto the matching controls, so a
        // rejection lands where the user can act on it instead of as a banner.
        for (const [field, messages] of Object.entries(result.fieldErrors)) {
          if (field in EMPTY_VERIFICATION && messages?.[0]) {
            setError(field as keyof VerificationInput, {
              type: "server",
              message: messages[0],
            });
          }
        }
      }

      setFormError(result.formError ?? "Please check the highlighted fields and try again.");
    });
  };

  const videoError = errors.videoSelfie?.message ?? durationError ?? undefined;

  return (
    <form
      noValidate
      onSubmit={handleSubmit(onValid)}
      className="rounded-2xl border border-border-subtle bg-surface p-5 shadow-sm shadow-slate-900/[0.03] sm:p-6"
    >
      <h1 className="text-xl font-semibold text-foreground">Verify your request</h1>
      <p className="mt-1 text-sm text-muted">
        Photos of the product and a short video selfie let us confirm the request is genuine.
      </p>

      <Callout tone="info" title="Upload instructions" icon={<InfoIcon />} className="mt-5">
        <ul className="list-disc space-y-1 pl-4">
          <li>Take clear photos in good lighting.</li>
          <li>Make sure all text is readable.</li>
          <li>Accepted formats: JPG, PNG, HEIC.</li>
        </ul>
      </Callout>

      <fieldset className="mt-6 border-0 p-0">
        <legend className="text-sm font-semibold text-foreground">Product photos</legend>
        <div className="mt-3 grid gap-5 sm:grid-cols-2">
          <Controller
            control={control}
            name="frontPhoto"
            render={({ field }) => (
              <PhotoField
                name="frontPhoto"
                label="ID card (front side)"
                hint="Show the front face, including any labels."
                emptyPrompt="Add the front photo"
                error={errors.frontPhoto?.message}
                file={field.value}
                onFileChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          />
          <Controller
            control={control}
            name="backPhoto"
            render={({ field }) => (
              <PhotoField
                name="backPhoto"
                label="ID card (back side)"
                hint=""
                emptyPrompt="Add the back photo"
                error={errors.backPhoto?.message}
                file={field.value}
                onFileChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          />
        </div>
      </fieldset>

      <fieldset className="mt-7 border-0 p-0">
        <legend className="text-sm font-semibold text-foreground">Video selfie</legend>
        <div className="mt-3">
          <Controller
            control={control}
            name="videoSelfie"
            render={({ field }) => (
              <VideoSelfieField
                error={videoError}
                file={field.value}
                onFileChange={field.onChange}
                onBlur={field.onBlur}
                onDurationIssue={handleDurationIssue}
              />
            )}
          />
        </div>
      </fieldset>

      {formError ? (
        <Callout tone="danger" role="alert" className="mt-6">
          {formError}
        </Callout>
      ) : null}

      <div className="mt-7 flex flex-col-reverse gap-3 border-t border-border-subtle pt-5 sm:flex-row sm:justify-between">
        <Link href="/refund/details" className={buttonClassName("secondary", "sm:w-auto")}>
          Back to order details
        </Link>
        <Button type="submit" isLoading={isPending} className="sm:w-auto">
          {isPending ? (stepLabel ?? "Submitting…") : "Submit refund request"}
        </Button>
      </div>
    </form>
  );
}
