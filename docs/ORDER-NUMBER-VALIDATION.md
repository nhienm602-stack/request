# Order-number validation — how it works, and how to relax it

> **Purpose of this doc.** Customers are getting stuck on the order-number field
> rejecting their input. This explains exactly where that rule lives, how to
> turn it off (or soften it) without breaking the site, how to keep the test
> suite green so deploys stay clean, and how the change reaches production on
> Netlify. It is written so the change is **reversible by flipping one value**
> when you go back to fix it properly.

---

## 1. How the validation works today

All nine step-1 fields are validated by a **single Zod schema**:

```
lib/refund/details-schema.ts  →  refundDetailsSchema
```

That schema is the *single source of truth*. It is deliberately run in **three**
places, so there is only ever one rule to change:

| Where it runs | File | Why |
| --- | --- | --- |
| In the browser, live as the user types | `components/refund/refund-details-form.tsx` (via `zodResolver`) | Instant field-level feedback |
| On the server, when the form is submitted | `lib/refund/submission.ts` → `parseDetails()` | The client is not a trust boundary |
| On draft restore (returning to step 1 / refresh) | `hooks/use-refund-wizard.tsx` → `parseDraft()` | A saved draft is re-checked before it is trusted |

**This is the important part:** because all three import the *same* schema, you
only edit the schema **once** and the browser, the server, and the draft-restore
path all change together. There is no second copy to keep in sync.

### The specific rule that rejects order numbers

In `lib/refund/details-schema.ts`, the `orderNumber` field:

```ts
orderNumber: z
  .string()
  .trim()
  .min(1, "Order number is required.")
  .max(32, "Order number must be 32 characters or fewer.")
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9-]{3,}$/,
    "Enter the order number exactly as it appears on your receipt (letters, numbers and hyphens)."
  )
  .transform((value) => value.toUpperCase()),
```

The part that traps customers is the **`.regex(...)`**. It demands:

- first character is a letter or digit (no leading hyphen), **and**
- at least **4 more** characters after it (so a minimum length of 5), **and**
- only letters, digits and hyphens — **no spaces, slashes, `#`, or other punctuation.**

So a real order number like `12345`, `ORD 48213` (contains a space), `#4821`,
or `A/1` is rejected. That regex is almost certainly the source of the "invalid"
complaints.

---

## 2. The recommended change — a one-line toggle

Rather than deleting code (which you'd have to rewrite later), convert the rule
into a **feature flag**. You disable it now by flipping one boolean, and
re-enable the strict version later by flipping it back — nothing is lost.

### Step 2a — edit `lib/refund/details-schema.ts`

Just **above** the `refundDetailsSchema` definition (after the imports), add:

```ts
/**
 * Strict order-number format checking.
 *
 * TEMPORARY: set to `false` while the order lookup is unavailable so customers
 * are not blocked by format rejections. Set back to `true` to restore the full
 * format + length validation. See docs/ORDER-NUMBER-VALIDATION.md.
 */
const STRICT_ORDER_NUMBER = false;

const orderNumberField = STRICT_ORDER_NUMBER
  ? z
      .string()
      .trim()
      .min(1, "Order number is required.")
      .max(32, "Order number must be 32 characters or fewer.")
      .regex(
        /^[A-Za-z0-9][A-Za-z0-9-]{3,}$/,
        "Enter the order number exactly as it appears on your receipt (letters, numbers and hyphens)."
      )
      .transform((value) => value.toUpperCase())
  : // Relaxed: accept any non-empty value, still normalised to upper case.
    z
      .string()
      .trim()
      .min(1, "Order number is required.")
      .max(64, "Order number must be 64 characters or fewer.")
      .transform((value) => value.toUpperCase());
```

Then in the `.object({ ... })`, replace the whole `orderNumber: z...transform(...)`
block with the single line:

```ts
    orderNumber: orderNumberField,
```

**What this does:** with `STRICT_ORDER_NUMBER = false`, the field still can't be
empty (so the form stays professional — no blank submissions) and still can't be
absurdly long, but **any** reasonable order number the customer types is now
accepted. To restore the old behaviour later, change `false` back to `true`.
Nothing else needs to move.

### If you want to remove the check *entirely* (not even "required")

Use this relaxed branch instead (the `else` side):

```ts
  : z.string().trim().max(64).transform((value) => value.toUpperCase())
```

I'd keep `.min(1)` / "required" though — an empty order number gives you nothing
to match the refund against later, and keeping the field required is what keeps
the form looking intentional rather than broken.

### Optional, cosmetic — the hint text

In `components/refund/refund-details-form.tsx`, the order-number field has a
placeholder and hint that imply a format:

```tsx
placeholder="e.g. ORD-48213"
hint="Found at the top of your order confirmation email."
```

These don't affect validation, but while the rule is relaxed you may want the
hint to read simply `"Enter your order number."` so customers aren't nudged
toward a format that's no longer enforced. Purely optional.

---

## 3. Keep the tests green (so the deploy stays clean)

A few tests assert the **old strict behaviour**. If you don't update them,
`npm run test` fails and — depending on your setup — the Netlify build can fail
too. Update these to match the relaxed rule:

**`lib/refund/details-schema.test.ts`** — around line 44 there's a table of
rejections:

```ts
it.each([
  ["", "required"],
  ["AB", "receipt"],
  ["ORD 48213", "receipt"],
])("rejects the order number %j", (orderNumber) => {
  expect(errorFor({ orderNumber }, "orderNumber")).toBeDefined();
});
```

With the relaxed rule, only the empty string should still be rejected. Change it to:

```ts
it("still requires a non-empty order number", () => {
  expect(errorFor({ orderNumber: "" }, "orderNumber")).toBeDefined();
});

it.each(["AB", "ORD 48213", "12345", "#4821"])(
  "now accepts the order number %j",
  (orderNumber) => {
    expect(errorFor({ orderNumber }, "orderNumber")).toBeUndefined();
  }
);
```

**These tests stay as-is and should still pass** (because you kept "required"):

- `components/refund/refund-details-form.test.tsx` — "focuses the first invalid
  field" (relies on an empty order number still erroring).
- `e2e/refund-flow.spec.ts` — asserts `"Order number is required."`.
- `e2e/accessibility.spec.ts` — same required message.

If you take the "remove entirely / not required" route in §2, those three will
also need updating — tell me and I'll adjust them.

Before committing, run the gate locally:

```bash
npm run check        # lint + typecheck + unit tests
npm run test:e2e     # optional but recommended before a prod deploy
```

A green `npm run check` is what keeps the published site clean and the build
from breaking on Netlify.

---

## 4. Getting the change onto the live Netlify site

> There's no `netlify.toml` in the repo yet, so the site is deployed with
> Netlify's auto-detected defaults. Netlify auto-installs `@netlify/plugin-nextjs`
> when it sees a Next.js app, so the existing build already works — none of the
> below requires adding config.

### The clean, professional path: deploy by git push (continuous deployment)

Netlify watches your production branch (here, `master`) and builds + publishes
automatically on every push. So the safe sequence is:

1. **Work on a branch, not directly on `master`:**
   ```bash
   git checkout -b relax-order-number-validation
   ```
2. Make the schema + test edits from §2 and §3.
3. **Verify locally:**
   ```bash
   npm run check
   npm run build      # reproduces what Netlify will run; catches build errors early
   ```
4. **Commit and push the branch:**
   ```bash
   git add lib/refund/details-schema.ts lib/refund/details-schema.test.ts docs/ORDER-NUMBER-VALIDATION.md
   git commit -m "Relax order-number validation (temporary, toggle in schema)"
   git push -u origin relax-order-number-validation
   ```
5. **Open a Pull Request.** Netlify builds a **Deploy Preview** for the PR — a
   full, live copy of the site at a temporary URL. Open it, fill in the form with
   the order numbers customers were getting stuck on, and confirm they now go
   through. This is the step that keeps surprises off the live site.
6. **Merge the PR into `master`.** Netlify builds `master` and publishes it to
   your production domain automatically. No manual upload step.

### If you need it live *right now* (Netlify CLI)

If you can't wait for the PR flow, you can deploy from your machine:

```bash
# one-time: npm i -g netlify-cli && netlify login && netlify link
netlify deploy --build            # builds and publishes to a DRAFT url to check first
netlify deploy --build --prod     # promotes to the live production domain
```

Always do the draft (`--build` without `--prod`) first and click through the
form on the draft URL before running `--prod`.

### Rolling back if something looks wrong

Netlify keeps every past deploy. In the Netlify dashboard →
**Deploys** → pick the previous good deploy → **Publish deploy**. That reverts
the live site instantly while you investigate. (And since the change is behind
`STRICT_ORDER_NUMBER`, you can also just flip it back to `true` and redeploy.)

---

## 5. When you go back to fix it properly

- Flip `STRICT_ORDER_NUMBER` back to `true` and restore the stricter test rows.
- If the real goal is "does this order number exist in our system," that's not a
  regex job at all — it's a lookup against the order backend once it's back up.
  The toggle leaves a clean seam to drop that in: replace the relaxed branch with
  an async check instead of a format check.
- Separately, retire the Telegram hand-off for the ID/selfie step in favour of a
  provider that stores those documents securely — that's the part with real
  liability, independent of this order-number change.
