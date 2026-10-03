/**
 * Joins class names, dropping falsy entries.
 *
 * Deliberately not `clsx` + `tailwind-merge`: the components here never receive
 * conflicting utilities from callers, so a 12-line helper beats two more
 * dependencies to audit and upgrade.
 */
export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}
