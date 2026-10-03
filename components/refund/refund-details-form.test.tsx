import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RefundDetailsForm } from "./refund-details-form";

function renderForm(onSubmit = vi.fn()) {
  render(<RefundDetailsForm onSubmit={onSubmit} stepLabel="Order details" />);
  return { onSubmit, user: userEvent.setup() };
}

const summary = () => screen.getByRole("complementary", { name: /request summary/i });

/** The label/value pairs currently listed in the summary, in DOM order. */
function summaryRows(): [string, string][] {
  const terms = within(summary()).queryAllByRole("term");
  const definitions = within(summary()).queryAllByRole("definition");
  return terms.map((term, index) => [
    term.textContent ?? "",
    definitions[index]?.textContent ?? "",
  ]);
}

describe("RefundDetailsForm", () => {
  it("shows the current step and no entries before anything is typed", () => {
    renderForm();
    expect(within(summary()).getByText("Order details")).toBeInTheDocument();
    expect(summaryRows()).toEqual([]);
  });

  it("always shows the secure-processing notice", () => {
    renderForm();
    expect(within(summary()).getByText("Secure processing")).toBeInTheDocument();
    expect(
      within(summary()).getByText(/encrypted and will be reviewed within 2–3 business days/i)
    ).toBeInTheDocument();
  });

  it("adds a summary row as the user types", async () => {
    const { user } = renderForm();
    await user.type(screen.getByLabelText(/order number/i), "3333");
    expect(summaryRows()).toEqual([["Order number", "3333"]]);
  });

  it("keeps form order even when fields are filled out of order", async () => {
    const { user } = renderForm();

    // Amount first, order number second — the summary must still list the
    // order number above the amount.
    await user.type(screen.getByLabelText(/order amount/i), "20");
    expect(summaryRows().map(([label]) => label)).toEqual(["Order amount"]);

    await user.type(screen.getByLabelText(/order number/i), "3333");
    expect(summaryRows().map(([label]) => label)).toEqual(["Order number", "Order amount"]);
  });

  it("formats the amount as euros and resolves the country name", async () => {
    const { user } = renderForm();
    await user.type(screen.getByLabelText(/order amount/i), "49,99");
    await user.selectOptions(screen.getByLabelText(/country/i), "DE");

    const rows = Object.fromEntries(summaryRows().map(([label, value]) => [label, value]));
    expect(rows["Order amount"].replace(/\s/g, " ")).toBe("49,99 €");
    expect(rows["Country"]).toBe("Germany");
  });

  it("reports a field error only after the user leaves it", async () => {
    const { user } = renderForm();
    const email = screen.getByLabelText(/email/i);

    await user.type(email, "not-an-email");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await user.tab();
    expect(await screen.findByRole("alert")).toHaveTextContent(/valid email address/i);
    expect(email).toHaveAttribute("aria-invalid", "true");
  });

  it("does not submit an incomplete form and focuses the first invalid field", async () => {
    const { user, onSubmit } = renderForm();
    await user.click(screen.getByRole("button", { name: /continue to verification/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/order number/i)).toHaveFocus();
  });

  it("validates the postal code against the selected country", async () => {
    const { user } = renderForm();
    await user.selectOptions(screen.getByLabelText(/country/i), "NL");
    // Valid in Italy, not in the Netherlands.
    await user.type(screen.getByLabelText(/zip code/i), "20121");
    await user.tab();

    expect(await screen.findByText(/valid Netherlands postal code/i)).toBeInTheDocument();
  });

  it("submits normalised values once every field is valid", async () => {
    const { user, onSubmit } = renderForm();

    await user.type(screen.getByLabelText(/order number/i), "ord-48213");
    await user.type(screen.getByLabelText(/order amount/i), "49,99");
    await user.type(screen.getByLabelText(/full name/i), "Maria Rossi");
    await user.type(screen.getByLabelText(/email/i), "Maria@Example.com");
    await user.type(screen.getByLabelText(/phone number/i), "+39 02 1234 5678");
    await user.type(screen.getByLabelText(/address/i), "Via Roma 12");
    await user.type(screen.getByLabelText(/city/i), "Milano");
    await user.type(screen.getByLabelText(/zip code/i), "20121");
    await user.selectOptions(screen.getByLabelText(/country/i), "IT");

    await user.click(screen.getByRole("button", { name: /continue to verification/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      orderNumber: "ORD-48213",
      email: "maria@example.com",
      country: "IT",
    });
  });
});
