/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@mui/x-data-grid'],
  experimental: {
    forceSwcTransforms: true,
  },
  env: {
    NEXTAUTH_URL: process.env.NEXTAUTH_URL || 'http://localhost:3000',
    NEXTAUTH_URL_INTERNAL: process.env.NEXTAUTH_URL_INTERNAL || 'http://localhost:3000',
    NEXT_PUBLIC_SERVER_URL: process.env.NEXT_PUBLIC_SERVER_URL || 'https://aibi.cloudline.co.il',
    NEXT_PUBLIC_WS_BASE_URL: process.env.NEXT_PUBLIC_WS_BASE_URL || '',
  },
  webpack: (config: any, { isServer }: { isServer: boolean }) => {
    // ➊ Fix case sensitivity issues on Windows
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': require('path').resolve(__dirname, 'src'),
    };
    
    // ➋ Better case sensitivity handling
    if (!isServer) {
      config.resolve.symlinks = false;
    }
    
    // ➌ נספק polyfills למודולי Node core
    config.resolve.fallback = {
      ...(config.resolve.fallback || {}),
      buffer: require.resolve('buffer/'),
      stream: require.resolve('stream-browserify'),
      util: require.resolve('util/'),
      process: require.resolve('process/browser'),
    };

    // ➍ נחשוף את Buffer ו-process כ-ProvidePlugin
    const webpack = require('webpack');
    config.plugins.push(
      new webpack.ProvidePlugin({
        Buffer: ['buffer', 'Buffer'],
        process: ['process/browser'],
      })
    );

    return config;
  },
};

module.exports = nextConfig;
