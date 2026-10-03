import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VerificationForm } from "./verification-form";
import { refundDetailsSchema } from "@/lib/refund/details-schema";
import { submitRefundRequest } from "@/lib/refund/submit-refund-request";

// The submission call is the boundary under test here; its own logic is covered
// in lib/refund/submit-refund-request.test.ts, and the server side in
// lib/refund/submission.test.ts.
vi.mock("@/lib/refund/submit-refund-request", () => ({
  submitRefundRequest: vi.fn(async () => ({ status: "success", reference: "RF-ABCD-2345" })),
}));

const submitMock = vi.mocked(submitRefundRequest);

const DETAILS = refundDetailsSchema.parse({
  orderNumber: "ORD-48213",
  orderAmount: "49,99",
  fullName: "Maria Rossi",
  email: "maria@example.com",
  phone: "+39 02 1234 5678",
  address: "Via Roma 12",
  city: "Milano",
  zipCode: "20121",
  country: "IT",
});

const photo = (name = "front.jpg", type = "image/jpeg") =>
  new File([new Uint8Array(2048)], name, { type });
const video = () => new File([new Uint8Array(4096)], "selfie.mp4", { type: "video/mp4" });

function setup() {
  const onSubmitted = vi.fn();
  render(<VerificationForm details={DETAILS} onSubmitted={onSubmitted} />);
  return { onSubmitted, user: userEvent.setup() };
}

/** Uploads through the real input, so RHF's Controller wiring is exercised. */
async function uploadAll(user: ReturnType<typeof userEvent.setup>) {
  await user.upload(screen.getByLabelText(/front of the product/i), photo());
  await user.upload(screen.getByLabelText(/back of the product/i), photo("back.png", "image/png"));
  await user.upload(screen.getByLabelText(/video selfie/i), video());
}

beforeEach(() => {
  submitMock.mockClear();
  submitMock.mockResolvedValue({ status: "success", reference: "RF-ABCD-2345" });
});

describe("VerificationForm", () => {
  it("shows the upload instructions", () => {
    setup();
    expect(screen.getByText(/take clear photos in good lighting/i)).toBeInTheDocument();
    expect(screen.getByText(/make sure all text is readable/i)).toBeInTheDocument();
    expect(screen.getByText(/accepted formats: jpg, png, heic/i)).toBeInTheDocument();
  });

  it("shows the video selfie instructions, including the left and right cues", () => {
    setup();
    expect(screen.getByText(/slowly turn left/i)).toBeInTheDocument();
    expect(screen.getByText(/slowly turn right and back to centre/i)).toBeInTheDocument();
    expect(screen.getByText(/face clearly visible/i)).toBeInTheDocument();
    expect(screen.getByText("Left")).toBeInTheDocument();
    expect(screen.getByText("Right")).toBeInTheDocument();
  });

  it("reflects a chosen file in the UI", async () => {
    const { user } = setup();
    await user.upload(screen.getByLabelText(/front of the product/i), photo());
    expect(await screen.findByText("front.jpg")).toBeInTheDocument();
  });

  it("does not submit when files are missing, and says which are needed", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: /submit refund request/i }));

    expect(await screen.findByText(/add a photo of the front/i)).toBeInTheDocument();
    expect(screen.getByText(/add a photo of the back/i)).toBeInTheDocument();
    expect(screen.getByText(/add a video selfie/i)).toBeInTheDocument();
    expect(submitMock).not.toHaveBeenCalled();
  });

  it("rejects a dropped file of the wrong type before it reaches the server", async () => {
    // The file picker filters by `accept`, so a disallowed type can only arrive
    // by drag-and-drop — which is exactly why the rule lives in the schema
    // rather than relying on the input attribute.
    const { user } = setup();
    const dropZone = screen.getByText("Add the front photo").closest("label");
    expect(dropZone).not.toBeNull();

    fireEvent.drop(dropZone!, {
      dataTransfer: { files: [new File([new Uint8Array(10)], "notes.pdf", { type: "application/pdf" })] },
    });

    await user.click(screen.getByRole("button", { name: /submit refund request/i }));

    expect(await screen.findByText(/must be a JPG, PNG or HEIC file/i)).toBeInTheDocument();
    expect(submitMock).not.toHaveBeenCalled();
  });

  it("ignores a file the picker itself would have filtered out", async () => {
    // Belt and braces: the input advertises `accept`, so the browser never
    // hands a PDF over through the picker in the first place.
    const { user } = setup();
    await user.upload(
      screen.getByLabelText(/front of the product/i),
      new File([new Uint8Array(10)], "notes.pdf", { type: "application/pdf" })
    );
    expect(screen.queryByText("notes.pdf")).not.toBeInTheDocument();
  });

  it("submits the details and all three files, then reports the reference", async () => {
    const { user, onSubmitted } = setup();
    await uploadAll(user);
    await user.click(screen.getByRole("button", { name: /submit refund request/i }));

    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(1));

    const [sentDetails, sentFiles] = submitMock.mock.calls[0];
    expect(sentDetails).toMatchObject({ orderNumber: "ORD-48213", country: "IT" });
    expect(sentFiles.frontPhoto.name).toBe("front.jpg");
    expect(sentFiles.backPhoto.name).toBe("back.png");
    expect(sentFiles.videoSelfie.name).toBe("selfie.mp4");

    await waitFor(() => expect(onSubmitted).toHaveBeenCalledWith("RF-ABCD-2345"));
  });

  it("places a server-side field rejection back on the matching field", async () => {
    submitMock.mockResolvedValue({
      status: "invalid",
      fieldErrors: { frontPhoto: ["The front photo must be 10 MB or smaller."] },
    });

    const { user, onSubmitted } = setup();
    await uploadAll(user);
    await user.click(screen.getByRole("button", { name: /submit refund request/i }));

    expect(await screen.findByText(/must be 10 MB or smaller/i)).toBeInTheDocument();
    expect(onSubmitted).not.toHaveBeenCalled();
  });

  it("surfaces a server failure as a retryable banner", async () => {
    submitMock.mockResolvedValue({ status: "error", formError: "We could not submit your request." });

    const { user, onSubmitted } = setup();
    await uploadAll(user);
    await user.click(screen.getByRole("button", { name: /submit refund request/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not submit/i);
    expect(onSubmitted).not.toHaveBeenCalled();
  });
});
