# "We could not submit your request" — diagnosis & fix

> Customers fill the form, click submit, and see:
> *"We could not submit your request just now. Please try again in a moment."*
> This explains **why**, how to **confirm** which cause you have, and how to
> **fix each one properly**. Read §1 first — it's almost certainly your case.

---

## The trap: that message means two different things

The exact string lives in **two** files:

| File | When it fires | HTTP seen by browser |
| --- | --- | --- |
| `lib/refund/submission.ts` (`GENERIC_FAILURE`) | The **server ran** and the Telegram hand-off *threw* | `500` with JSON `{"error":{"message":...}}` |
| `lib/refund/submit-refund-request.ts` (`UNEXPECTED_ERROR`) | The **client got a reply it couldn't parse** as the app's JSON contract | anything non-JSON: `413`, `502`, an HTML page |

So the same sentence appears whether your *code* failed **or** whether the
*platform* rejected the request before your code could answer. Telling them
apart is the whole game — do the 2-minute check in §3.

---

## 1. Most likely cause: the upload is bigger than Netlify allows

The app's own limits (`lib/refund/media.ts`):

- Front photo: up to **10 MB**
- Back photo: up to **10 MB**
- Video selfie: up to **50 MB**

→ a single submission can be **~70 MB**, and a *typical* real one (two phone
photos + a short video) is easily **5–25 MB**.

**Netlify serverless functions cap the request body at ~6 MB.** Next.js API
routes (like `app/api/refund-requests/route.ts`) run as these functions. When
the body exceeds the cap, **Netlify returns its own 413/502 before your handler
can respond.** The browser receives Netlify's non-JSON error, the client code
can't match it to the expected contract, and it shows the generic
`UNEXPECTED_ERROR` fallback.

This fits "**every** client hits it": almost every genuine submission is over
6 MB. The route file even flags this risk in its own header comment ("Request
size is now whatever the hosting platform and any proxy in front of it allow").

---

## 2. Other possible cause: the Telegram hand-off throws

If the body *does* fit under the limit, the failure is instead inside
`lib/refund/submission-handoff.ts`, which throws (and is caught + logged as
`[refund] hand-off failed`, then returned as the generic 500) when:

- **Env vars missing/typo'd** — `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` not set
  for the deployed context. *(Less likely here: your `netlify.toml`'s
  `SECRETS_SCAN_OMIT_KEYS` line implies both are configured in Netlify — but
  confirm they're set for the **production** context, not just previews.)*
- **Wrong chat id, or the bot can't post there** — Telegram returns 400
  "chat not found" or 403 "bot can't initiate conversation with a user" if the
  bot was never started / added to that chat. Classic "worked in dev, fails in
  prod" when the chat id changed.
- **Video over Telegram's own limit** — the Bot API caps `sendDocument` uploads
  at **50 MB**. A video at the app's 50 MB ceiling sits right on that edge.
- **Timeout** — uploading tens of MB onward to Telegram from inside a function
  with a short execution limit can time out mid-send.

> Design note (worth fixing eventually): the hand-off is **not atomic**. It
> sends the text message, then each file, in sequence. If the text succeeds but
> a photo/video send fails, the operator receives a *partial* submission **and**
> the customer sees an error and retries — producing duplicates. A proper fix
> uploads everything first and only reports success once all parts land.

---

## 3. Confirm which one you have (2 minutes, decisive)

Reproduce a real submission with browser **DevTools → Network** open. Click the
`refund-requests` request and read the **Status** and **Response**:

| What you see | Cause | Go to |
| --- | --- | --- |
| Status **413** or **502**, response is HTML / "Netlify" | Body-size limit (§1) | Fix A |
| Status **500**, response is JSON `{"error":...}` | Hand-off threw (§2) | Fix B |
| Status **0 / network error / CORS** | Request never completed (size/timeout) | Fix A |

Cross-check in **Netlify → your site → Logs → Functions**:
- If you **see** `[refund] hand-off failed` with a cause → it's §2 (Fix B); the
  cause line names the real error.
- If you **don't** see it (the function never logged) → the request didn't reach
  your code → §1 (Fix A).

---

## Fix A — request body exceeds the platform limit (the proper fix)

The real fix is **don't push large media through the serverless function.** In
order of how proper vs. how fast:

1. **Best / proper: upload media directly to storage, send only links through
   the function.** The browser uploads the photos and video straight to object
   storage (e.g. Netlify Blobs, S3, Cloudflare R2, Supabase Storage) via a
   short-lived signed URL, then the form POSTs just the *text details + the
   storage URLs* to `/api/refund-requests` — a tiny JSON body, safely under the
   limit. The Telegram message then links to the files (or a worker forwards
   them server-to-server, where the 6 MB inbound cap doesn't apply). This also
   happens to be the **secure, auditable** way to handle ID documents — it
   lines up with retiring the raw-Telegram hand-off, not against it.

2. **Interim / fast: shrink what you accept** so a whole submission stays under
   ~5 MB. In `lib/refund/media.ts`, drop `VIDEO_CONSTRAINTS.maxBytes` to e.g.
   `4 * MEGABYTE` and `PHOTO_CONSTRAINTS.maxBytes` to `2 * MEGABYTE`, and
   compress client-side. This is a stop-gap — a 60-second video won't fit in
   4 MB at decent quality, so it degrades UX — but it unblocks submissions today
   without re-architecting. **Test on the Deploy Preview with a real phone
   video before trusting it.**

3. **Check whether a larger-limit function type is available** for your Netlify
   plan/runtime (background functions still take the same ~6 MB *inbound*
   request, so they don't solve the upload size — they only help with execution
   time). Don't assume this alone fixes it; verify with a real upload.

> I did **not** change any of these for you — option 1 is an architecture change
> and option 2 trades away video quality, so both are your call. Tell me which
> and I'll implement it on the branch.

## Fix B — the Telegram hand-off is throwing

1. Read the `cause` in the Netlify function log line `[refund] hand-off failed`
   — it names the exact failure.
2. **Env vars:** Netlify → Site configuration → Environment variables. Confirm
   `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` exist **and are enabled for the
   Production context**. Redeploy after changing them (env changes need a new
   build/deploy to take effect).
3. **Bot can post to the chat:** send `/start` to the bot from the target chat
   (or add the bot to the group) so it's allowed to message that `chat_id`.
   Verify the id with a manual call:
   `https://api.telegram.org/bot<token>/getUpdates` (run it yourself; don't
   paste the token anywhere shared).
4. **Video size:** if the cause is a Telegram 413/"file too big", the video
   exceeds the Bot API's 50 MB send limit → this converges with Fix A.

---

## While you're in here — two unrelated cleanups the investigation surfaced

- **Remove the tracked dev log.** `.next/dev/logs/next-development.log` is still
  committed. It's build/runtime noise that shouldn't be in git:
  ```bash
  git rm --cached ".next/dev/logs/next-development.log"
  ```
  (`.next/` is already gitignored, so it won't come back.) Keep this out of the
  order-number PR — do it as its own small commit.
- **Confirm production env vars** as in Fix B step 2, regardless of cause —
  it's the cheapest thing to rule out.

---

## Summary

- The message is a **shared fallback**; it does **not** by itself mean Telegram
  failed. Check the Network tab status first (§3).
- **Most likely:** real uploads exceed Netlify's ~6 MB function body limit, so
  the platform rejects them before your code runs. Proper fix: upload media to
  storage and send only links/metadata through the function (Fix A.1). Fast
  stop-gap: shrink the accepted file sizes (Fix A.2).
- **If instead** logs show `[refund] hand-off failed`: work through Fix B
  (env vars for Production, bot allowed in the chat, video under 50 MB).
