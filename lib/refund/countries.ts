/**
 * Country registry.
 *
 * Single source of truth for everything that varies per country: the option
 * list rendered in the form, the postal-code rule, and the region handed to
 * libphonenumber-js. Adding a country is a one-line change here and requires
 * no edits to the schema, the form, or the summary panel.
 */
import type { CountryCode } from "libphonenumber-js";

export interface Country {
  /** ISO 3166-1 alpha-2. Also the region code understood by libphonenumber-js. */
  readonly code: CountryCode;
  readonly name: string;
  /** Validates the ZIP/postal code for this country. */
  readonly postalCode: RegExp;
  /** Shown in the field hint and in the validation message, so the rule is discoverable. */
  readonly postalExample: string;
}

/**
 * Ordered alphabetically by name — this is the order the select renders in.
 * Euro-area countries first is deliberately *not* done: alphabetical is
 * predictable and scannable, and the field is searchable by typing.
 */
export const COUNTRIES = [
  { code: "AT", name: "Austria", postalCode: /^\d{4}$/, postalExample: "1010" },
  { code: "BE", name: "Belgium", postalCode: /^\d{4}$/, postalExample: "1000" },
  { code: "CZ", name: "Czechia", postalCode: /^\d{3} ?\d{2}$/, postalExample: "110 00" },
  { code: "DK", name: "Denmark", postalCode: /^\d{4}$/, postalExample: "1050" },
  { code: "FI", name: "Finland", postalCode: /^\d{5}$/, postalExample: "00100" },
  { code: "FR", name: "France", postalCode: /^\d{5}$/, postalExample: "75001" },
  { code: "DE", name: "Germany", postalCode: /^\d{5}$/, postalExample: "10115" },
  { code: "GR", name: "Greece", postalCode: /^\d{3} ?\d{2}$/, postalExample: "105 57" },
  {
    code: "IE",
    name: "Ireland",
    // Eircode: routing key + unique identifier, excluding easily-confused letters.
    postalCode: /^[AC-FHKNPRTV-Y]\d{2} ?[0-9AC-FHKNPRTV-Y]{4}$/i,
    postalExample: "D02 AF30",
  },
  { code: "IT", name: "Italy", postalCode: /^\d{5}$/, postalExample: "00184" },
  { code: "LU", name: "Luxembourg", postalCode: /^(L-)?\d{4}$/i, postalExample: "1111" },
  {
    code: "NL",
    name: "Netherlands",
    postalCode: /^\d{4} ?[A-Za-z]{2}$/,
    postalExample: "1012 AB",
  },
  { code: "NO", name: "Norway", postalCode: /^\d{4}$/, postalExample: "0150" },
  { code: "PL", name: "Poland", postalCode: /^\d{2}-\d{3}$/, postalExample: "00-001" },
  { code: "PT", name: "Portugal", postalCode: /^\d{4}-\d{3}$/, postalExample: "1000-001" },
  { code: "ES", name: "Spain", postalCode: /^\d{5}$/, postalExample: "28001" },
  { code: "SE", name: "Sweden", postalCode: /^\d{3} ?\d{2}$/, postalExample: "111 29" },
  { code: "CH", name: "Switzerland", postalCode: /^\d{4}$/, postalExample: "8001" },
  {
    code: "GB",
    name: "United Kingdom",
    postalCode: /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i,
    postalExample: "SW1A 1AA",
  },
] as const satisfies readonly Country[];

export type SupportedCountryCode = (typeof COUNTRIES)[number]["code"];

const BY_CODE = new Map<string, Country>(COUNTRIES.map((c) => [c.code, c]));

export function findCountry(code: string | undefined | null): Country | undefined {
  return code ? BY_CODE.get(code) : undefined;
}

export function isSupportedCountry(code: unknown): code is SupportedCountryCode {
  return typeof code === "string" && BY_CODE.has(code);
}

export const COUNTRY_CODES = COUNTRIES.map((c) => c.code) as readonly SupportedCountryCode[];
