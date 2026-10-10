import { describe, expect, it } from "vitest";
import { refundDetailsSchema } from "./details-schema";
import type { RefundDetailsInput } from "./details-schema";

const VALID: RefundDetailsInput = {
  orderNumber: "ord-48213",
  orderAmount: "49,99",
  fullName: "Maria Rossi",
  email: "Maria@Example.COM",
  phone: "+39 02 1234 5678",
  address: "Via Roma 12",
  city: "Milano",
  zipCode: "20121",
  country: "IT",
};

/** Returns the message reported for `field`, or undefined if it passed. */
function errorFor(overrides: Partial<RefundDetailsInput>, field: keyof RefundDetailsInput) {
  const result = refundDetailsSchema.safeParse({ ...VALID, ...overrides });
  if (result.success) return undefined;
  return result.error.issues.find((issue) => issue.path[0] === field)?.message;
}

describe("refundDetailsSchema", () => {
  it("accepts a well-formed submission", () => {
    const result = refundDetailsSchema.safeParse(VALID);
    expect(result.success).toBe(true);
  });

  it("normalises the order number and email", () => {
    const result = refundDetailsSchema.parse(VALID);
    // Both are case-insensitive identifiers; storing one canonical form keeps
    // downstream lookups from missing on casing alone.
    expect(result.orderNumber).toBe("ORD-48213");
    expect(result.email).toBe("maria@example.com");
  });

  it("trims surrounding whitespace", () => {
    const result = refundDetailsSchema.parse({ ...VALID, city: "  Milano  " });
    expect(result.city).toBe("Milano");
  });

  // Strict format checking is temporarily disabled (STRICT_ORDER_NUMBER=false
  // in details-schema.ts). An empty order number is still rejected, but values
  // that the old format regex refused are now accepted. See
  // docs/ORDER-NUMBER-VALIDATION.md.
  it("still rejects an empty order number", () => {
    expect(errorFor({ orderNumber: "" }, "orderNumber")).toBeDefined();
  });

  it.each(["AB", "ORD 48213", "12345", "#4821"])(
    "now accepts the order number %j",
    (orderNumber) => {
      expect(errorFor({ orderNumber }, "orderNumber")).toBeUndefined();
    }
  );

  it("requires both a first and last name", () => {
    expect(errorFor({ fullName: "Maria" }, "fullName")).toMatch(/first and last name/i);
  });

  it("accepts names with accents, hyphens and apostrophes", () => {
    expect(errorFor({ fullName: "Jean-Luc O'Néill" }, "fullName")).toBeUndefined();
  });

  it("rejects an invalid email", () => {
    expect(errorFor({ email: "maria@" }, "email")).toBeDefined();
  });

  describe("country-dependent rules", () => {
    it("rejects a postal code in the wrong national format", () => {
      // A 5-digit code is valid in Italy but not in the Netherlands.
      expect(errorFor({ country: "NL", zipCode: "20121" }, "zipCode")).toMatch(/Netherlands/);
    });

    it("accepts the matching national format", () => {
      expect(
        errorFor({ country: "NL", zipCode: "1012 AB", phone: "+31 20 123 4567" }, "zipCode")
      ).toBeUndefined();
    });

    it("accepts a national phone number for the selected country", () => {
      expect(errorFor({ phone: "02 1234 5678" }, "phone")).toBeUndefined();
    });

    it("rejects a phone number that is not valid for the selected country", () => {
      expect(errorFor({ phone: "123" }, "phone")).toMatch(/Italy/);
    });

    it("rejects an unsupported country", () => {
      expect(errorFor({ country: "ZZ" as RefundDetailsInput["country"] }, "country")).toBeDefined();
    });

    it("does not pile a second error onto phone and ZIP when the country is missing", () => {
      // Reporting three errors for one mistake sends the user chasing fields
      // that are actually fine.
      const result = refundDetailsSchema.safeParse({
        ...VALID,
        country: "" as RefundDetailsInput["country"],
      });
      expect(result.success).toBe(false);
      if (result.success) return;
      const fields = result.error.issues.map((issue) => issue.path[0]);
      expect(fields).toEqual(["country"]);
    });
  });
});
