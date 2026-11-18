import path from "node:path";
import type { NextConfig } from "next";

// Container builds (Google Cloud Run) set NEXT_OUTPUT=standalone: a self-contained server in .next/standalone.
// The tracing root is the monorepo root so shared packages are included. Netlify/Vercel builds are unchanged.
const standalone = process.env.NEXT_OUTPUT === "standalone"
  ? { output: "standalone" as const, outputFileTracingRoot: path.resolve(process.cwd(), "../..") }
  : {};

const nextConfig: NextConfig = {
  ...standalone,
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
