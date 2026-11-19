import type { NextConfig } from "next";

// Keep standalone output rooted at this app so Firebase App Hosting finds its route manifest.
const standalone = process.env.NEXT_OUTPUT === "standalone"
  ? { output: "standalone" as const }
  : {};

const nextConfig: NextConfig = {
  ...standalone,
  outputFileTracingRoot: process.cwd(),
  transpilePackages: ["@nammapros/ui", "@nammapros/config", "@nammapros/types", "@nammapros/api-client"],
  images: {
    dangerouslyAllowLocalIP: process.env.NODE_ENV !== "production",
    remotePatterns: [
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "8000",
      },
      {
        protocol: "http",
        hostname: "localhost",
        port: "8000",
      },
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

export default nextConfig;
