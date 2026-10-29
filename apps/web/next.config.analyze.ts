import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const config: NextConfig = {
  transpilePackages: ['@vuldetected/ui', '@vuldetected/db'],
  outputFileTracingRoot: import.meta.dirname,
  serverExternalPackages: ['@node-rs/argon2', 'postgres', 'pino'],
  output: 'standalone',
  outputFileTracingIncludes: {
    '/**': ['./messages/**/*.json', './node_modules/next/dist/server/lib/cpu-profile*.js'],
  },
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=()',
          },
        ],
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin();
export default withBundleAnalyzer(withNextIntl(config));
