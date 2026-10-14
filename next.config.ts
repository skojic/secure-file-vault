import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // AGENTS.md is maintained by hand; stop `next dev` from rewriting it.
  agentRules: false,
};

export default nextConfig;
