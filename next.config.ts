import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  agentRules: false,
  reactStrictMode: false,
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
