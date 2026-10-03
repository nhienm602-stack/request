/**
 * Placeholder shown for the single frame between hydration and the draft being
 * read from storage.
 *
 * It mirrors the real layout's dimensions so the page does not jump when the
 * form replaces it. `aria-hidden` plus a live status message means assistive
 * tech hears "Loading" once instead of reading out a wall of empty boxes.
 */
export function FormSkeleton() {
  return (
    <>
      <p className="sr-only" role="status">
        Loading your request…
      </p>
      <div
        aria-hidden="true"
        className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start"
      >
        <div className="animate-pulse rounded-2xl border border-border-subtle bg-surface p-5 sm:p-6">
          <div className="h-6 w-48 rounded bg-border-subtle" />
          <div className="mt-2 h-4 w-72 max-w-full rounded bg-border-subtle" />
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            {Array.from({ length: 8 }, (_, index) => (
              <div key={index} className="flex flex-col gap-2">
                <div className="h-4 w-24 rounded bg-border-subtle" />
                <div className="h-10 w-full rounded-lg bg-surface-muted" />
              </div>
            ))}
            <div className="flex flex-col gap-2 sm:col-span-2">
              <div className="h-4 w-24 rounded bg-border-subtle" />
              <div className="h-10 w-full rounded-lg bg-surface-muted" />
            </div>
          </div>
        </div>
        <div className="animate-pulse rounded-2xl border border-border-subtle bg-surface p-5">
          <div className="h-5 w-36 rounded bg-border-subtle" />
          <div className="mt-6 h-4 w-24 rounded bg-border-subtle" />
          <div className="mt-3 h-4 w-40 rounded bg-border-subtle" />
          <div className="mt-8 h-20 w-full rounded-xl bg-surface-muted" />
        </div>
      </div>
    </>
  );
}
