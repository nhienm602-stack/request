# Deploying this app to Netlify — a first-timer's step-by-step

> You're deploying this yourself for the first time while the developers are
> busy. This walks through **every** step: what to edit, how to push to GitHub,
> and how that reaches the live Netlify site — slowly and safely, with a way to
> undo at each stage. Take it one numbered step at a time.
>
> For the specific order-number code change, this doc points you at
> [ORDER-NUMBER-VALIDATION.md](ORDER-NUMBER-VALIDATION.md); here we focus on the
> git + deploy mechanics.

---

## The one thing to understand first

Your Netlify site is (almost certainly) connected to your GitHub repo
`nhienm602-stack/request`. When a repo is connected, Netlify watches **one
branch** — the **production branch**, which here is **`master`**:

- **Push to `master`  →  Netlify rebuilds and the LIVE site updates automatically.**
- **Push to any other branch  →  the live site is untouched;** Netlify builds a
  separate temporary "Deploy Preview" URL instead, so you can test safely.

That is the whole mechanism. There's no separate "upload" button you have to
press — git *is* the deploy trigger. Because pushing to `master` goes live
immediately, we'll use a **separate branch + preview** first, and only touch
`master` once you've seen it working.

---

## Step 0 — Confirm the GitHub ↔ Netlify connection (do this once)

Before anything, confirm pushing actually deploys, and to where:

1. Go to **https://app.netlify.com** and log in.
2. Click your refund site.
3. Go to **Site configuration → Build & deploy → Continuous deployment**.
4. Check two things:
   - **Repository** says `github.com/nhienm602-stack/request`.
   - **Production branch** says `master`.
5. If both match, you're set: pushing to `master` deploys live. If the
   repository is *not* linked, stop and ask a developer — the git-push method
   won't work and you'd need the manual CLI method (Appendix A).

While you're here, note the **Deploys** tab — that's where you'll watch builds
run and where you roll back if needed.

---

## Step 1 — Get the latest code and open a safe branch

Open a terminal in the project folder
(`C:\Users\HP 830 G9\Documents\request-github\request`) and run these one at a time:

```bash
# 1. Make sure you have the newest code from GitHub
git checkout master
git pull origin master

# 2. Create your own branch to work on (this keeps master/live untouched)
git checkout -b relax-order-number-validation
```

You're now on a branch called `relax-order-number-validation`. Nothing you do
here affects the live site until you choose to merge it.

---

## Step 2 — Make the code edit

Open the project in your editor and make the change described in
[ORDER-NUMBER-VALIDATION.md §2](ORDER-NUMBER-VALIDATION.md). In short, in
`lib/refund/details-schema.ts` you add the `STRICT_ORDER_NUMBER = false` toggle
and point `orderNumber` at it, then update the two test rows in
`lib/refund/details-schema.test.ts` as described there.

> Want me to just make these edits for you on this branch? Say so and I will —
> then you only have to do Steps 3–6.

---

## Step 3 — Test it on your own machine BEFORE pushing

This is the step that prevents a broken live site. Run:

```bash
npm install          # only needed the first time, or if dependencies changed
npm run check        # lint + typecheck + unit tests — must pass
npm run build        # this is the SAME build Netlify runs — must succeed
```

- If `npm run check` fails, the message tells you which test/file. Fix it (or
  ask me) before continuing — don't push a red build.
- If `npm run build` succeeds, Netlify's build will almost certainly succeed too.

Optionally, see it in a real browser:

```bash
npm run dev          # then open http://localhost:3000 and try the form
```

Press `Ctrl+C` to stop the dev server when done.

---

## Step 4 — Commit your change

"Committing" saves a labelled snapshot of your edits into git:

```bash
# See what you changed
git status

# Stage the files you edited
git add lib/refund/details-schema.ts lib/refund/details-schema.test.ts

# Save them with a message describing the change
git commit -m "Relax order-number validation (temporary toggle)"
```

---

## Step 5 — Push the branch to GitHub

This uploads your branch to GitHub. **Because it is NOT `master`, the live site
does not change yet** — this is safe:

```bash
git push -u origin relax-order-number-validation
```

If git asks you to sign in, use your GitHub account. (If it asks for a password
and rejects it, GitHub needs a "personal access token" instead of your password
— ask a developer for one, or use GitHub Desktop to sign in.)

---

## Step 6 — Review it on the Deploy Preview, then go live

1. The `git push` output prints a link to **"Create a pull request."** Open it
   in your browser and click **Create pull request**.
2. Within a minute or two, Netlify adds a comment / status check on the PR with a
   **"Deploy Preview"** link. Click it — this is a full, live copy of the site at
   a temporary address, built from your change.
3. **Test the preview:** open the refund form and type the order numbers
   customers were getting stuck on. Confirm they now go through, and that the
   rest of the form still works.
4. When the preview looks right, **merge the pull request** (green "Merge" button
   → "Confirm merge").
5. Merging puts your change onto `master`. **Netlify now automatically builds
   `master` and publishes it to the live site.** Watch it on the Netlify
   **Deploys** tab — the newest row shows "Building…" then "Published." When it
   says **Published**, the live site is updated.

That's the deploy. Done.

---

## If something looks wrong on the live site — rolling back

You have two easy undo options:

**Option A — instant rollback in Netlify (no code needed):**
1. Netlify dashboard → your site → **Deploys**.
2. Find the previous working deploy (the row *below* your new one).
3. Click it → **Publish deploy**. The live site reverts to that version
   immediately while you sort things out.

**Option B — turn the change off in code:**
In `lib/refund/details-schema.ts`, set `STRICT_ORDER_NUMBER` back to `true`,
then repeat Steps 4–6. This restores the original validation.

---

## Quick reference — the whole flow in commands

```bash
git checkout master
git pull origin master
git checkout -b relax-order-number-validation
# ...edit the files...
npm run check && npm run build          # must both pass
git add lib/refund/details-schema.ts lib/refund/details-schema.test.ts
git commit -m "Relax order-number validation (temporary toggle)"
git push -u origin relax-order-number-validation
# ...open PR, check Deploy Preview, merge → live deploy runs automatically...
```

---

## Appendix A — Deploying without the PR flow (Netlify CLI)

Only if you need it live immediately and can't use the PR route. This deploys
straight from your machine:

```bash
npm i -g netlify-cli      # one time
netlify login             # one time — opens the browser to authorise
netlify link              # one time — connects this folder to your Netlify site

netlify deploy --build            # builds and publishes to a DRAFT preview url
# open the draft url it prints, test the form, then:
netlify deploy --build --prod     # promotes to the LIVE production site
```

Always run the draft (`--build` without `--prod`) and test it first. Only run
`--prod` once the draft looks right.

---

## Appendix B — Common first-time snags

- **"Nothing happened after I pushed to a branch."** Correct — only `master`
  deploys live. Non-`master` branches build a *preview*, which appears on the PR.
- **The Netlify build failed but `npm run build` worked locally.** Usually a
  Node version mismatch or a missing environment variable. This app's hand-off
  needs `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` set in
  **Netlify → Site configuration → Environment variables**; if those aren't set
  in Netlify, submissions will fail even though the build succeeds. Check that
  Netlify's Node version is 20 or newer (your machine runs v24).
- **Git asks for a password and rejects it.** GitHub no longer accepts account
  passwords on the command line — you need a personal access token, or sign in
  via GitHub Desktop. Ask a developer if unsure.
- **I'm scared of pushing to `master` directly.** Then don't — always use the
  branch + PR + preview flow above. It's the professional default and it means
  the live site only changes at the single moment you click "Merge."
```
