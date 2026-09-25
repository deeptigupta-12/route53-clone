import type { NextConfig } from "next";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  transpilePackages: ["@cloudscape-design/components", "@cloudscape-design/component-toolkit"],
  async rewrites() {
    // The browser only talks to Next.js; /api is proxied so the session cookie stays same-origin.
    return [{ source: "/api/:path*", destination: `${BACKEND_URL}/api/:path*` }];
  },
};

export default nextConfig;
