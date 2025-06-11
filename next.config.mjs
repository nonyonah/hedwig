import { createRequire } from 'module';
import webpack from 'webpack';

const require = createRequire(import.meta.url);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  // Configure Turbopack
  turbopack: {
    resolveAlias: {
      // Add any necessary aliases here
    }
  },
  
  // External packages for server components
  serverExternalPackages: [
    '@coinbase/agentkit',
    '@walletconnect/universal-provider',
    '@reown/appkit',
    'jose',
    '@coinbase/cdp-sdk',
    'buffer',
    'crypto-browserify',
    'stream-browserify',
    'process'
  ],
  
  // Enable server actions
  experimental: {
    serverActions: {}
  },
  
  // Webpack configuration for client-side only
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Client-side configuration
      config.resolve.fallback = {
        ...config.resolve.fallback,
        // Node.js core modules
        fs: false,
        net: false,
        tls: false,
        dns: false,
        child_process: false,
        // Polyfills
        crypto: require.resolve('crypto-browserify'),
        stream: require.resolve('stream-browserify'),
        buffer: require.resolve('buffer/'),
        util: require.resolve('util/'),
        assert: require.resolve('assert/'),
        path: require.resolve('path-browserify'),
        process: require.resolve('process/browser'),
        // Additional polyfills
        os: require.resolve('os-browserify/browser'),
        https: require.resolve('https-browserify'),
        http: require.resolve('stream-http'),
        zlib: require.resolve('browserify-zlib'),
        querystring: require.resolve('querystring-es3'),
        url: require.resolve('url/')
      };

      // Add polyfills
      config.plugins = [
        ...config.plugins,
        new webpack.ProvidePlugin({
          process: 'process/browser',
          Buffer: ['buffer', 'Buffer'],
          // Add global polyfills
          crypto: 'crypto-browserify',
          stream: 'stream-browserify',
          util: 'util/'
        })
      ];

      // Handle @coinbase/cdp-sdk and its dependencies
      config.resolve.alias = {
        ...config.resolve.alias,
        // Use the default export of @coinbase/cdp-sdk
        '@coinbase/cdp-sdk': '@coinbase/cdp-sdk',
        // Add other potential missing modules
        'node:crypto': 'crypto-browserify',
        'node:stream': 'stream-browserify',
        'node:buffer': 'buffer/'
      };
      
      // Handle chacha20poly1305 if needed by @coinbase/cdp-sdk
      config.resolve.fallback = {
        ...config.resolve.fallback,
        './src/chacha20Poly1305.js': false
      };
    }

    return config;
  }
};

export default nextConfig;
