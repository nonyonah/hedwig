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
        new (require('webpack').ProvidePlugin)({
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
        '@coinbase/cdp-sdk': require.resolve('@coinbase/cdp-sdk/dist/browser/index.js'),
        // Add a more specific alias for the missing module
        './src/chacha20Poly1305.js': require.resolve('@noble/ciphers/chacha20poly1305'),
        // Add other potential missing modules
        'node:crypto': 'crypto-browserify',
        'node:stream': 'stream-browserify',
        'node:buffer': 'buffer/'
      };
    }

    return config;
  },
  
  // Webpack 5 configuration
  webpack5: true,

  // Webpack configuration is defined above
};

export default nextConfig;
