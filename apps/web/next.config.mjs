// The browser only ever talks to same-origin /api/*; Next proxies those calls to
// the backend so there's no CORS and no API URL baked into client bundles.
// API_INTERNAL_URL is read at server start: localhost in dev, `http://api:4000`
// inside Docker Compose.
const API = process.env.API_INTERNAL_URL || 'http://localhost:4000';

// Security headers applied to every response by the Next.js server itself, so they
// hold regardless of which reverse proxy fronts the app (the inline Hostinger Caddy
// command sets none). The CSP is conservative but allows the inline styles Next/React
// emit; tighten with nonces if the app later moves off inline styles.
const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'Permissions-Policy', value: 'geolocation=(), microphone=(), camera=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@unlikelyland/contracts'],
  poweredByHeader: false,
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API}/:path*` }];
  },
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
