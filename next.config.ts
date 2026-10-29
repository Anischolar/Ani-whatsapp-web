import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Puppeteer / whatsapp-web.js must be loaded with Node's require, not bundled.
  serverExternalPackages: ["whatsapp-web.js", "puppeteer", "puppeteer-core", "fluent-ffmpeg", "mongoose"],
  // Runtime data (uploads, WhatsApp/Chrome session, dev DB) must never be traced into the build:
  // Chrome keeps those files locked while the app runs, which crashes `next build`.
  // Turbopack ignores this for the proxy trace and reads the whole project, so `npm run build` uses --webpack.
  outputFileTracingExcludes: { "*": ["./storage/**/*"] },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
