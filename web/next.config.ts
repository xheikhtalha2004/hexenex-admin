import type { NextConfig } from "next";

// A strict Content-Security-Policy is deliberately NOT set here: Next.js's dev server and
// build output rely on inline scripts/styles (HMR, styled-jsx) that would need a proper
// nonce/hash setup to keep working under a strict CSP — a half-configured CSP that breaks
// the app (or gets silently disabled) is worse than these safer, well-supported headers.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
