import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { VALID_DETAILS, jpegFixture, mp4Fixture, pngFixture } from "./fixtures";

/**
 * Automated accessibility checks.
 *
 * These catch the mechanical failures — missing names, broken label
 * associations, insufficient contrast, bad ARIA. They are a floor, not a
 * ceiling: axe detects roughly a third of real barriers, and says nothing about
 * whether the flow is actually *usable* with a screen reader. Manual testing
 * with NVDA and VoiceOver is still outstanding (docs/ROADMAP.md, item 15).
 */
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function analyse(page: Page) {
  return new AxeBuilder({ page }).withTags(WCAG).analyze();
}

/** Reports the rule and the offending markup, so a failure is actionable. */
function describeViolations(violations: Awaited<ReturnType<typeof analyse>>["violations"]) {
  return violations
    .map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.html).join("\n  ")}`)
    .join("\n\n");
}

async function fillDetails(page: Page) {
  await page.getByLabel("Order number").fill(VALID_DETAILS.orderNumber);
  await page.getByLabel("Order amount (€)").fill(VALID_DETAILS.orderAmount);
  await page.getByLabel("Full name").fill(VALID_DETAILS.fullName);
  await page.getByLabel("Email").fill(VALID_DETAILS.email);
  await page.getByLabel("Country").selectOption(VALID_DETAILS.country);
  await page.getByLabel("Phone number").fill(VALID_DETAILS.phone);
  await page.getByLabel("Address").fill(VALID_DETAILS.address);
  await page.getByLabel("City").fill(VALID_DETAILS.city);
  await page.getByLabel("ZIP code").fill(VALID_DETAILS.zipCode);
}

test.describe("accessibility", () => {
  test("step 1 has no automatically detectable violations", async ({ page }) => {
    await page.goto("/refund/details");
    await expect(page.getByLabel("Order number")).toBeVisible();

    const { violations } = await analyse(page);
    expect(describeViolations(violations)).toBe("");
  });

  test("step 1 stays clean while showing validation errors", async ({ page }) => {
    await page.goto("/refund/details");
    // The error state is a different DOM: `aria-invalid`, `role="alert"`, and
    // error text wired into `aria-describedby`. Worth auditing on its own.
    await page.getByRole("button", { name: "Continue to verification" }).click();
    await expect(page.getByText("Order number is required.")).toBeVisible();

    const { violations } = await analyse(page);
    expect(describeViolations(violations)).toBe("");
  });

  test("step 2 has no automatically detectable violations", async ({ page }) => {
    await page.goto("/refund/details");
    await fillDetails(page);
    await page.getByRole("button", { name: "Continue to verification" }).click();
    await expect(page.getByText("Add the front photo")).toBeVisible();

    const { violations } = await analyse(page);
    expect(describeViolations(violations)).toBe("");
  });

  test("step 2 stays clean once files are attached", async ({ page }) => {
    await page.goto("/refund/details");
    await fillDetails(page);
    await page.getByRole("button", { name: "Continue to verification" }).click();

    await page.getByLabel("Front of the product").setInputFiles(jpegFixture());
    await page.getByLabel("Back of the product").setInputFiles(pngFixture());
    await page.getByLabel("Video selfie").setInputFiles(mp4Fixture());
    await expect(page.getByText("front.jpg")).toBeVisible();

    const { violations } = await analyse(page);
    expect(describeViolations(violations)).toBe("");
  });

  test("every field is reachable and operable by keyboard alone", async ({ page }) => {
    await page.goto("/refund/details");
    await page.getByLabel("Order number").focus();

    // Tabbing from the first field must walk the form in visual order and land
    // on the submit button — no traps, nothing skipped.
    const expected = [
      "orderAmount",
      "fullName",
      "email",
      "phone",
      "address",
      "city",
      "zipCode",
      "country",
    ];

    for (const id of expected) {
      await page.keyboard.press("Tab");
      await expect(page.locator(`#${id}`)).toBeFocused();
    }

    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Continue to verification" })).toBeFocused();
  });
});
