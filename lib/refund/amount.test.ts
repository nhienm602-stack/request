import { describe, expect, it } from "vitest";
import {
  MAX_ORDER_AMOUNT,
  formatEuro,
  normalizeAmountInput,
  parseOrderAmount,
} from "./amount";

describe("normalizeAmountInput", () => {
  it.each([
    ["1234.56", "1234.56"],
    ["1234,56", "1234.56"],
    // Both separators present: the last one is the decimal point.
    ["1.234,56", "1234.56"],
    ["1,234.56", "1234.56"],
    ["1.234.567,89", "1234567.89"],
    // Swiss apostrophe grouping.
    ["1'234.56", "1234.56"],
    ["€ 49,99", "49.99"],
    ["49", "49"],
  ])("normalises %s to %s", (input, expected) => {
    expect(normalizeAmountInput(input)).toBe(expected);
  });

  it("treats a single separator with three trailing digits as grouping", () => {
    // "1,234" is ambiguous; reading it as 1234 is the only interpretation that
    // is also a valid money amount.
    expect(normalizeAmountInput("1,234")).toBe("1234");
    expect(normalizeAmountInput("1.234")).toBe("1234");
  });

  it.each([
    "",
    "abc",
    "12abc",
    "-5",
    ".",
    ",",
    "1..2",
    "1,,2",
    "49,",
    // Mis-grouped: real thousands separators come in threes.
    "1.23.456",
  ])("rejects %j", (input) => {
    expect(normalizeAmountInput(input)).toBeNull();
  });

  it("accepts a leading separator as a fraction", () => {
    expect(normalizeAmountInput(",5")).toBe("0.5");
  });

  it("reads a single separator with one or two trailing digits as a decimal", () => {
    expect(normalizeAmountInput("12,34")).toBe("12.34");
    expect(normalizeAmountInput("12.3")).toBe("12.3");
  });
});

describe("parseOrderAmount", () => {
  it("accepts a well-formed amount", () => {
    expect(parseOrderAmount("49,99")).toEqual({ ok: true, value: 49.99 });
  });

  it("rejects more than two decimal places", () => {
    expect(parseOrderAmount("49.9999")).toEqual({ ok: false, reason: "too-many-decimals" });
    expect(parseOrderAmount("49,9999")).toEqual({ ok: false, reason: "too-many-decimals" });
  });

  it("reads a single separator with three trailing digits as grouping", () => {
    // "49.999" is ambiguous. Reading it as 49999 is the only interpretation
    // that yields a valid money amount, and it matches what a German or
    // Italian user typing thousands actually means.
    expect(parseOrderAmount("49.999")).toEqual({ ok: true, value: 49999 });
  });

  it("rejects a trailing separator, so a half-typed amount is not guessed at", () => {
    expect(parseOrderAmount("49,")).toEqual({ ok: false, reason: "not-a-number" });
  });

  it("rejects zero and negatives", () => {
    expect(parseOrderAmount("0")).toEqual({ ok: false, reason: "out-of-range" });
    expect(parseOrderAmount("-5")).toEqual({ ok: false, reason: "not-a-number" });
  });

  it("rejects amounts above the ceiling", () => {
    expect(parseOrderAmount(String(MAX_ORDER_AMOUNT + 1))).toEqual({
      ok: false,
      reason: "out-of-range",
    });
  });

  it("accepts the boundary values", () => {
    expect(parseOrderAmount("0,01")).toEqual({ ok: true, value: 0.01 });
    expect(parseOrderAmount(String(MAX_ORDER_AMOUNT))).toEqual({
      ok: true,
      value: MAX_ORDER_AMOUNT,
    });
  });
});

describe("formatEuro", () => {
  it("formats using the euro convention", () => {
    // Non-breaking space before the symbol in the de-DE locale.
    expect(formatEuro(1234.5).replace(/ /g, " ")).toBe("1.234,50 €");
  });
});
