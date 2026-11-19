import type { NextConfig } from "next";

// Keep standalone output rooted at this app so Firebase App Hosting finds its route manifest.
const standalone = process.env.NEXT_OUTPUT === "standalone"
  ? { output: "standalone" as const }
  : {};
const apiImageOrigin = process.env.NEXT_PUBLIC_API_BASE_URL;

const nextConfig: NextConfig = {
  ...standalone,
  outputFileTracingRoot: process.cwd(),
  transpilePackages: ["@nammapros/ui", "@nammapros/config", "@nammapros/types", "@nammapros/api-client"],
  images: {
    dangerouslyAllowLocalIP: process.env.NODE_ENV !== "production",
    formats: ["image/avif", "image/webp"],
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
      {
        protocol: "https",
        hostname: "**.onrender.com",
      },
      ...(apiImageOrigin ? [new URL(apiImageOrigin)] : []),
    ],
  },
  // One services page: /services?city=..&category=..&service=.. Older path-style links redirect to it.
  async redirects() {
    return [
      { source: "/services/:category/:service", destination: "/services?category=:category&service=:service", permanent: true },
      { source: "/services/:category", destination: "/services?category=:category", permanent: true },
      // Search is a pop-up now; the old search page goes home.
      { source: "/search", destination: "/", permanent: true },
      // The cart and booking happen on /checkout; old /book links (with ?service=) carry over.
      { source: "/book", destination: "/checkout", permanent: false },
      // No category: the full list isn't shown; send visitors to the home page categories.
      { source: "/services", missing: [{ type: "query", key: "category" }], destination: "/#categories", permanent: false },
    ];
  },
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
      ],
    }];
  },
};

export default nextConfig;
