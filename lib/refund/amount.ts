/**
 * Money parsing for the "Order amount (€)" field.
 *
 * The field is a free-text input rather than `<input type="number">` on purpose:
 * number inputs silently drop invalid keystrokes, scroll-wheel-mutate their
 * value, and render a locale-dependent decimal separator that users then cannot
 * type. Free text plus explicit parsing gives us a real error message instead.
 *
 * Users across the euro area type all four of these for the same amount:
 *   1234.56   1234,56   1.234,56   1,234.56
 */

export const MIN_ORDER_AMOUNT = 0.01;
export const MAX_ORDER_AMOUNT = 100_000;

/**
 * Normalises a human-typed amount to a plain decimal string (`"1234.56"`).
 * Returns `null` when the input cannot be read as a number at all.
 */
export function normalizeAmountInput(raw: string): string | null {
  // Strip currency symbols, regular/thin/non-breaking spaces, and apostrophe
  // grouping (used in Switzerland: 1'234.56).
  const cleaned = raw.replace(/[€\s  ']/g, "");
  if (cleaned === "") return null;
  if (!/^[\d.,]+$/.test(cleaned)) return null;

  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");

  let decimalSeparator: "." | "," | null = null;

  if (lastDot !== -1 && lastComma !== -1) {
    // Both present: whichever comes last is the decimal separator.
    decimalSeparator = lastDot > lastComma ? "." : ",";
  } else if (lastDot !== -1 || lastComma !== -1) {
    const sep = lastDot !== -1 ? "." : ",";
    const occurrences = cleaned.split(sep).length - 1;
    const trailingDigits = cleaned.length - cleaned.lastIndexOf(sep) - 1;
    // A repeated separator is always grouping ("1.234.567").
    // A single separator followed by exactly three digits is ambiguous
    // ("1,234"); treat it as grouping, since a 3-decimal money amount is
    // invalid anyway and would be rejected below.
    decimalSeparator = occurrences === 1 && trailingDigits !== 3 ? sep : null;
  }

  // Split into integer and fraction *before* stripping anything, so the
  // remaining separators can be structurally verified rather than blindly
  // deleted. Deleting them outright would quietly accept nonsense like "1..2"
  // as 12.
  let integerPart: string;
  let fractionPart: string | null;
  // When there is no decimal separator, every separator present is grouping —
  // so the grouping character is whichever one actually appears, not a fixed
  // guess.
  let grouping: "." | ",";

  if (decimalSeparator === null) {
    integerPart = cleaned;
    fractionPart = null;
    grouping = lastComma !== -1 ? "," : ".";
  } else {
    const splitAt = cleaned.lastIndexOf(decimalSeparator);
    integerPart = cleaned.slice(0, splitAt);
    fractionPart = cleaned.slice(splitAt + 1);
    grouping = decimalSeparator === "." ? "," : ".";
  }

  const digits = stripGrouping(integerPart, grouping);
  if (digits === null) return null;

  if (fractionPart === null) return digits;
  // A trailing separator ("49,") is mid-keystroke, not a number yet.
  if (!/^\d+$/.test(fractionPart)) return null;
  return `${digits}.${fractionPart}`;
}

/**
 * Validates and removes thousands separators.
 *
 * The integer part must be either plain digits or correctly grouped in threes
 * ("1.234.567"). Returning `null` for anything else is what keeps malformed
 * input from being silently reinterpreted.
 */
function stripGrouping(integerPart: string, grouping: "." | ","): string | null {
  // Leading separator, as in ".5" — treat the integer part as zero.
  if (integerPart === "") return "0";
  if (/^\d+$/.test(integerPart)) return integerPart;

  const groupPattern = grouping === "." ? /^\d{1,3}(\.\d{3})+$/ : /^\d{1,3}(,\d{3})+$/;
  if (!groupPattern.test(integerPart)) return null;
  return integerPart.split(grouping).join("");
}

export type AmountParseFailure =
  | "not-a-number"
  | "too-many-decimals"
  | "out-of-range";

export type AmountParseResult =
  | { ok: true; value: number }
  | { ok: false; reason: AmountParseFailure };

export function parseOrderAmount(raw: string): AmountParseResult {
  const normalized = normalizeAmountInput(raw);
  if (normalized === null) return { ok: false, reason: "not-a-number" };

  const [, decimals = ""] = normalized.split(".");
  if (decimals.length > 2) return { ok: false, reason: "too-many-decimals" };

  const value = Number(normalized);
  if (!Number.isFinite(value)) return { ok: false, reason: "not-a-number" };
  if (value < MIN_ORDER_AMOUNT || value > MAX_ORDER_AMOUNT) {
    return { ok: false, reason: "out-of-range" };
  }
  return { ok: true, value };
}

const EURO = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

/** Formats a parsed amount for display in the summary panel. */
export function formatEuro(value: number): string {
  return EURO.format(value);
}
