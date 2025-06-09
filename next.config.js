/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Don't resolve 'fs' module on the client to prevent this error
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: require.resolve('crypto-browserify'),
        stream: require.resolve('stream-browserify'),
        buffer: require.resolve('buffer/'),
        util: require.resolve('util/')
      };
    } else {
      // Server-side specific configurations
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }

    // Add polyfills for Node.js modules
    config.resolve.alias = {
      ...config.resolve.alias,
      'crypto': 'crypto-browserify',
      'stream': 'stream-browserify',
      'buffer': 'buffer/'
    };

    return config;
  },
  // Disable server components external packages
  experimental: {
    serverComponentsExternalPackages: ['@coinbase/agentkit']
  },
  // Disable Turbopack as it might cause issues with some packages
  // turbopack: {},
};

module.exports = nextConfig;