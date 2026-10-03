import type { Metadata } from "next";
import { Stepper } from "@/components/refund/stepper";
import { WIZARD_STEPS, stepIndex } from "@/lib/refund/steps";
import { VerificationStep } from "./verification-step";

export const metadata: Metadata = {
  title: "Verification · Request a refund",
  description:
    "Upload photos of your product and a short video selfie to verify your refund request.",
};

export default function VerificationPage() {
  return (
    <div className="flex flex-col gap-8">
      <Stepper steps={WIZARD_STEPS} currentIndex={stepIndex("verification")} />
      <VerificationStep />
    </div>
  );
}
