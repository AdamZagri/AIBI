/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // ➊ Fix case sensitivity issues on Windows
    config.resolve.alias = {
      ...config.resolve.alias,
      // Normalize case-sensitive imports
      '@': require('path').resolve(__dirname, 'src'),
    };
    
    // ➋ נספק polyfills למודולי Node core
    config.resolve.fallback = {
      ...(config.resolve.fallback || {}),
      buffer: require.resolve('buffer/'),
      stream: require.resolve('stream-browserify'),
      util: require.resolve('util/'),
      process: require.resolve('process/browser'),
    };

    // ➌ נחשוף את Buffer ו-process כ-ProvidePlugin כדי שקוד של plotly ימצא אותם
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
