// The browser only ever talks to same-origin /api/*; Next proxies those calls to
// the backend so there's no CORS and no API URL baked into client bundles.
// API_INTERNAL_URL is read at server start: localhost in dev, `http://api:4000`
// inside Docker Compose.
const API = process.env.API_INTERNAL_URL || 'http://localhost:4000';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@unlikelyland/contracts'],
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API}/:path*` }];
  },
};

export default nextConfig;
