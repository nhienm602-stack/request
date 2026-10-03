import { describe, expect, it } from "vitest";
import { SUMMARY_FIELDS, buildSummaryEntries } from "./summary-fields";
import { EMPTY_REFUND_DETAILS } from "./details-schema";

describe("summary field manifest", () => {
  it("covers every field in the details form exactly once", () => {
    // Guards the requirement that the summary can never silently omit a field
    // added to the schema, or list one twice.
    const manifest = SUMMARY_FIELDS.map((field) => field.name);
    expect([...manifest].sort()).toEqual(Object.keys(EMPTY_REFUND_DETAILS).sort());
    expect(new Set(manifest).size).toBe(manifest.length);
  });
});

describe("buildSummaryEntries", () => {
  it("returns nothing for an empty form", () => {
    expect(buildSummaryEntries(EMPTY_REFUND_DETAILS)).toEqual([]);
  });

  it("shows a field as soon as it has a value", () => {
    expect(buildSummaryEntries({ orderNumber: "3333" })).toEqual([
      { name: "orderNumber", label: "Order number", value: "3333" },
    ]);
  });

  it("keeps form order regardless of the order fields were filled in", () => {
    // The stated requirement: entering the amount first and the order number
    // second must still list the order number on top.
    const entries = buildSummaryEntries({ orderAmount: "20", orderNumber: "3333" });
    expect(entries.map((entry) => entry.name)).toEqual(["orderNumber", "orderAmount"]);
  });

  it("skips blank and whitespace-only values", () => {
    expect(buildSummaryEntries({ orderNumber: "   ", city: "Milano" })).toEqual([
      { name: "city", label: "City", value: "Milano" },
    ]);
  });

  it("formats a parseable amount as euros", () => {
    const [entry] = buildSummaryEntries({ orderAmount: "1234,5" });
    expect(entry.value.replace(/\s/g, " ")).toBe("1.234,50 €");
  });

  it("echoes a half-typed amount rather than showing a wrong number", () => {
    const [entry] = buildSummaryEntries({ orderAmount: "49," });
    expect(entry.value).toBe("49,");
  });

  it("resolves the country code to its display name", () => {
    expect(buildSummaryEntries({ country: "DE" })).toEqual([
      { name: "country", label: "Country", value: "Germany" },
    ]);
  });

  it("omits an unrecognised country code", () => {
    expect(buildSummaryEntries({ country: "ZZ" })).toEqual([]);
  });
});
