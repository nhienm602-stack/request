import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Statically typed `Link`/`router.push` targets. Catches broken wizard
  // navigation at compile time instead of in the browser.
  typedRoutes: true,
};

export default nextConfig;
