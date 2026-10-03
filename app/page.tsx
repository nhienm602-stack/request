import { redirect } from "next/navigation";

/**
 * The app has a single purpose, so the root sends the user straight into the
 * wizard. `redirect` in a Server Component issues this before any HTML is
 * streamed — no client-side flash of an intermediate page.
 */
export default function Home() {
  redirect("/refund/details");
}
