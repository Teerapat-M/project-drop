import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@drop/tokens', '@drop/types'],
};

export default nextConfig;
