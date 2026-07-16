import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // App-route multipart requests pass through vinext's progressive-action
    // parser first. Keep this only slightly above the route's 10 MiB file cap
    // so valid cover uploads are not rejected before route validation runs.
    serverActions: {
      bodySizeLimit: "10.1mb",
    },
  },
};

export default nextConfig;
