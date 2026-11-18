import path from "node:path";
import type { NextConfig } from "next";

// Container builds (Google Cloud Run) set NEXT_OUTPUT=standalone: a self-contained server in .next/standalone.
// The tracing root is the monorepo root so shared packages are included. Netlify/Vercel builds are unchanged.
const standalone = process.env.NEXT_OUTPUT === "standalone"
  ? { output: "standalone" as const, outputFileTracingRoot: path.resolve(process.cwd(), "../..") }
  : {};

const nextConfig: NextConfig = {
  ...standalone,
  transpilePackages: ["@nammapros/ui"],
};

export default nextConfig;
