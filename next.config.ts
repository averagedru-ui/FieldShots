import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Required for camera access on iOS — needs HTTPS (Vercel provides this automatically)
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};

export default nextConfig;
