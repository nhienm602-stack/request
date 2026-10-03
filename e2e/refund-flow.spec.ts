import { expect, test, type Page } from "@playwright/test";
import { VALID_DETAILS, jpegFixture, mp4Fixture, pngFixture } from "./fixtures";
import { REFUND_SUBMISSION_ENDPOINT } from "../lib/refund/submission-contract";

async function fillDetails(page: Page) {
  await page.getByLabel("Order number").fill(VALID_DETAILS.orderNumber);
  await page.getByLabel("Order amount (€)").fill(VALID_DETAILS.orderAmount);
  await page.getByLabel("Full name").fill(VALID_DETAILS.fullName);
  await page.getByLabel("Email").fill(VALID_DETAILS.email);
  // Country first: it determines the phone and postal rules.
  await page.getByLabel("Country").selectOption(VALID_DETAILS.country);
  await page.getByLabel("Phone number").fill(VALID_DETAILS.phone);
  await page.getByLabel("Address").fill(VALID_DETAILS.address);
  await page.getByLabel("City").fill(VALID_DETAILS.city);
  await page.getByLabel("ZIP code").fill(VALID_DETAILS.zipCode);
}

async function attachAllFiles(page: Page) {
  await page.getByLabel("Front of the product").setInputFiles(jpegFixture());
  await page.getByLabel("Back of the product").setInputFiles(pngFixture());
  await page.getByLabel("Video selfie").setInputFiles(mp4Fixture());
}

test.describe("refund request flow", () => {
  test("carries the form through both steps and reaches the submission endpoint", async ({
    page,
  }) => {
    await page.goto("/refund/details");
    await fillDetails(page);

    // The summary panel mirrors the form as it is filled.
    const summary = page.getByRole("complementary", { name: "Request summary" });
    await expect(summary.getByText("ORD-48213")).toBeVisible();
    await expect(summary.getByText("Italy")).toBeVisible();

    await page.getByRole("button", { name: "Continue to verification" }).click();
    await expect(page).toHaveURL(/\/refund\/verification$/);

    // Step 2 carries the validated details through, unchanged.
    await expect(summary.getByText("ORD-48213")).toBeVisible();

    await attachAllFiles(page);

    // Previews confirm the files reached React state, not just the DOM input.
    await expect(page.getByText("front.jpg")).toBeVisible();
    await expect(page.getByText("back.png")).toBeVisible();
    await expect(page.getByText("selfie.mp4")).toBeVisible();

    const request = page.waitForRequest(
      (req) => req.url().includes(REFUND_SUBMISSION_ENDPOINT) && req.method() === "POST"
    );
    const response = page.waitForResponse((res) =>
      res.url().includes(REFUND_SUBMISSION_ENDPOINT)
    );

    await page.getByRole("button", { name: "Submit refund request" }).click();

    const posted = await request;
    expect(posted.headers()["content-type"]).toContain("multipart/form-data");

    // The body itself cannot be inspected here — Chromium does not expose
    // file-backed multipart payloads to `postData()` or `postDataBuffer()`.
    // The status is the stronger evidence anyway: 501 is only reachable after
    // the details, all three files, and their magic-byte checks have passed, so
    // it proves the complete payload arrived intact and was validated. The
    // request/response bodies themselves are asserted directly against the
    // endpoint in the two specs below.
    const res = await response;
    expect(res.status()).toBe(501);

    // Scoped to the form: Next.js's route announcer is also role="alert".
    await expect(
      page.locator("form").getByRole("alert").filter({ hasText: /not connected to a service yet/i })
    ).toBeVisible();
    await expect(page).toHaveURL(/\/refund\/verification$/);
  });

  test("validates a payload posted straight to the endpoint, bypassing the UI", async ({
    request,
  }) => {
    // The endpoint is reachable without ever loading the form, so the
    // browser-side checks carry no authority. This payload would never survive
    // the UI's own validation.
    const response = await request.post(REFUND_SUBMISSION_ENDPOINT, {
      multipart: {
        details: JSON.stringify({ ...VALID_DETAILS, email: "definitely-not-an-email" }),
        frontPhoto: jpegFixture(),
        backPhoto: pngFixture(),
        videoSelfie: mp4Fixture(),
      },
    });

    expect(response.status()).toBe(422);
    const body = await response.json();
    expect(body.error.fieldErrors.email).toBeDefined();
    expect(body).not.toHaveProperty("reference");
  });

  test("answers 501 for a valid payload while no integration is wired up", async ({ request }) => {
    const response = await request.post(REFUND_SUBMISSION_ENDPOINT, {
      multipart: {
        details: JSON.stringify(VALID_DETAILS),
        frontPhoto: jpegFixture(),
        backPhoto: pngFixture(),
        videoSelfie: mp4Fixture(),
      },
    });

    // Fully valid, and deliberately not accepted: nothing is there to receive
    // it, so claiming otherwise would be a lie to the user.
    expect(response.status()).toBe(501);
    expect(await response.json()).not.toHaveProperty("reference");
  });

  test("shows a pending state while the submission is in flight", async ({ page }) => {
    await page.goto("/refund/details");
    await fillDetails(page);
    await page.getByRole("button", { name: "Continue to verification" }).click();
    await attachAllFiles(page);

    // Hold the response open so the in-flight state is observable rather than
    // a race against a fast local server.
    await page.route(`**${REFUND_SUBMISSION_ENDPOINT}`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      await route.fallback();
    });

    await page.getByRole("button", { name: "Submit refund request" }).click();

    const submitting = page.getByRole("button", { name: /Submitting/ });
    await expect(submitting).toBeVisible();
    await expect(submitting).toBeDisabled();
  });

  test("shows the confirmation page once the endpoint returns a reference", async ({ page }) => {
    await page.goto("/refund/details");
    await fillDetails(page);
    await page.getByRole("button", { name: "Continue to verification" }).click();
    await attachAllFiles(page);

    // Stands in for a wired-up hand-off, so the success path stays covered
    // while the integration is outstanding.
    await page.route(`**${REFUND_SUBMISSION_ENDPOINT}`, async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ reference: "INTEGRATION-SUPPLIED-1" }),
      });
    });

    await page.getByRole("button", { name: "Submit refund request" }).click();

    await expect(page).toHaveURL(/\/refund\/success\?reference=INTEGRATION-SUPPLIED-1/);
    await expect(page.getByText("INTEGRATION-SUPPLIED-1")).toBeVisible();
  });

  test("blocks a deep link into step 2 without order details", async ({ page }) => {
    await page.goto("/refund/verification");
    // Step 2 is meaningless without step 1's data, so the guard sends the user back.
    await expect(page).toHaveURL(/\/refund\/details$/);
  });

  test("keeps the order details after a reload of step 2", async ({ page }) => {
    await page.goto("/refund/details");
    await fillDetails(page);
    await page.getByRole("button", { name: "Continue to verification" }).click();
    await expect(page).toHaveURL(/\/refund\/verification$/);

    await page.reload();

    // Details survive in sessionStorage; file selections deliberately do not.
    await expect(page).toHaveURL(/\/refund\/verification$/);
    await expect(
      page.getByRole("complementary", { name: "Request summary" }).getByText("ORD-48213")
    ).toBeVisible();
    await expect(page.getByText("Add the front photo")).toBeVisible();
  });

  test("refuses to submit until every field is valid", async ({ page }) => {
    await page.goto("/refund/details");
    await page.getByRole("button", { name: "Continue to verification" }).click();

    await expect(page).toHaveURL(/\/refund\/details$/);
    await expect(page.getByText("Order number is required.")).toBeVisible();
    // Focus lands on the first invalid field so the user is not stranded.
    await expect(page.getByLabel("Order number")).toBeFocused();
  });

  test("validates the postal code against the chosen country", async ({ page }) => {
    await page.goto("/refund/details");
    await page.getByLabel("Country").selectOption("NL");
    await page.getByLabel("ZIP code").fill("20121");
    await page.getByLabel("City").click();

    await expect(page.getByText(/valid Netherlands postal code/)).toBeVisible();

    // Switching to a country where the code is valid clears the error.
    await page.getByLabel("Country").selectOption("IT");
    await expect(page.getByText(/valid Netherlands postal code/)).toBeHidden();
  });
});
