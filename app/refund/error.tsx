"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button, buttonClassName } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { InfoIcon } from "@/components/ui/icons";

/**
 * Error boundary for the whole refund wizard.
 *
 * Placed on the segment rather than the root so the wizard layout — and with it
 * the provider holding the user's draft — stays mounted. Recovering therefore
 * does not cost them the details they already typed.
 *
 * `retry()` re-renders the segment's children (Next.js 16; `reset()` is the
 * older, non-refetching variant).
 */
export default function RefundError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // Stands in for a real error reporting service. `digest` is the only handle
    // on the server-side stack, which Next.js withholds from the client in
    // production — quote it when investigating a user's report.
    console.error("[refund] unhandled error", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl">
      <Card className="p-6 sm:p-8">
        <h1 className="text-xl font-semibold text-foreground">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted">
          We hit an unexpected problem while handling your refund request. Nothing has been
          submitted.
        </p>

        <Callout tone="info" title="Your details are safe" icon={<InfoIcon />} className="mt-5">
          The information you have already entered is still here. Try again, or go back to the
          order details step to review it.
        </Callout>

        {error.digest ? (
          <p className="mt-4 text-xs text-muted">
            Reference for support: <span className="font-mono">{error.digest}</span>
          </p>
        ) : null}

        <div className="mt-7 flex flex-col-reverse gap-3 border-t border-border-subtle pt-5 sm:flex-row sm:justify-between">
          <Link href="/refund/details" className={buttonClassName("secondary", "sm:w-auto")}>
            Back to order details
          </Link>
          <Button onClick={retry} className="sm:w-auto">
            Try again
          </Button>
        </div>
      </Card>
    </div>
  );
}
