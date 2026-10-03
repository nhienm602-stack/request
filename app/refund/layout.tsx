import type { ReactNode } from "react";
import { RefundWizardProvider } from "@/hooks/use-refund-wizard";

/**
 * Wizard shell.
 *
 * A layout, not a page, so App Router keeps this subtree mounted while the user
 * moves between steps: the provider's state survives the navigation without any
 * serialisation. It stays a Server Component and delegates the stateful part to
 * the provider, keeping the client bundle to what genuinely needs interactivity.
 */
export default function RefundLayout({ children }: { children: ReactNode }) {
  return (
    <RefundWizardProvider>
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">{children}</div>
    </RefundWizardProvider>
  );
}
