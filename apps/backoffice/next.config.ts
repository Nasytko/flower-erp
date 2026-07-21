import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@flower/ui', '@flower/api-client', '@flower/contracts', '@flower/config'],
  poweredByHeader: false,
  reactStrictMode: true,
  // Standalone output requires symlinks; enable only in Linux Docker builds.
  ...(process.env.DOCKER_BUILD === '1' ? { output: 'standalone' as const } : {}),
};

export default nextConfig;
