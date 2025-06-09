// @ts-check

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable experimental ESM support
  experimental: {
    esmExternals: 'loose',
    serverComponentsExternalPackages: [
      '@coinbase/agentkit',
      '@walletconnect/universal-provider',
      'jose',
      'jose/*',
      '@coinbase/cdp-sdk',
      '@reown/appkit'
    ],
  },
  
  // Configure webpack
  webpack: (config, { isServer }) => {
    // Handle ESM packages
    config.experiments = {
      ...config.experiments,
      topLevelAwait: true,
    };

    // Add fallbacks for Node.js modules
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: require.resolve('crypto-browserify'),
        stream: require.resolve('stream-browserify'),
        buffer: require.resolve('buffer/'),
        util: require.resolve('util/'),
        assert: require.resolve('assert/'),
        os: require.resolve('os-browserify/browser'),
        https: require.resolve('https-browserify'),
        http: require.resolve('http-browserify'),
        url: require.resolve('url/')
      };
    } else {
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
      crypto: 'crypto-browserify',
      stream: 'stream-browserify',
      buffer: 'buffer/',
      util: 'util/',
      assert: 'assert/',
      os: 'os-browserify/browser',
      https: 'https-browserify',
      http: 'http-browserify',
      url: 'url/'
    };

    // Add rule to handle jose module
    config.module.rules.push({
      test: /\.m?js$/,
      resolve: {
        fullySpecified: false
      }
    });

    return config;
  },
  // Disable Turbopack as it might cause issues with some packages
  // turbopack: {},
};

export default nextConfig;