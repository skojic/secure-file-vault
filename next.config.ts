import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // AGENTS.md is maintained by hand; stop `next dev` from rewriting it.
  agentRules: false,
  // Pages that list files must not be stored by the browser or a shared cache (module 05, H6).
  async headers() {
    return [{ source: "/files/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] }];
  },
};

export default nextConfig;
