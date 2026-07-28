import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg", "bcryptjs"],
  // Dev-only CORS so the rider app's Expo *web* preview (localhost:8081) can call
  // the local API during development. Native apps don't need CORS; production
  // serves no cross-origin browser clients, so nothing is emitted there.
  async headers() {
    if (process.env.NODE_ENV !== "development") return [];
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "http://localhost:8081" },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,PATCH,DELETE,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization, Idempotency-Key, X-Client-Type" },
        ],
      },
    ];
  },
};

export default nextConfig;
