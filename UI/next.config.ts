/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@mui/x-data-grid'],
  experimental: {
    forceSwcTransforms: true,
  },
  env: {
    NEXTAUTH_URL: 'http://localhost:3000',
    NEXTAUTH_URL_INTERNAL: 'http://localhost:3000',
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
