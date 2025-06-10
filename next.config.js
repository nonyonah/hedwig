/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  // Enable experimental ESM support
  experimental: {
    esmExternals: 'loose',
    // Use serverComponentsExternalPackages for ESM dependencies
    serverComponentsExternalPackages: [
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
    serverActions: true,
    // Disable server components cache for development
    serverComponents: {
      cache: process.env.NODE_ENV === 'production',
    },
  },
  
  // Enable ESM support
  output: 'standalone',
  
  // Handle ESM packages
  modularizeImports: {
    '@coinbase/cdp-sdk': {
      transform: '@coinbase/cdp-sdk/dist/browser/index.js',
    },
    'jose': {
      transform: 'jose/dist/browser/index.js',
    },
    '@coinbase/cdp-sdk': {
      transform: '@coinbase/cdp-sdk/dist/browser/index.js',
    },
  },

  // Environment variables
  env: {
    WHATSAPP_VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN,
    WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN,
    WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID,
    CDP_API_KEY: process.env.CDP_API_KEY,
    CDP_API_SECRET: process.env.CDP_API_SECRET,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    
  },
  
  // Configure webpack
  webpack: (config, { isServer, webpack }) => {
    // Handle ESM packages
    config.experiments = {
      ...config.experiments,
      layers: true,
      asyncWebAssembly: true,
      topLevelAwait: true,
    };

    // Handle ESM dependencies
    config.module.rules.push({
      test: /\.m?js$/,
      resolve: {
        fullySpecified: false,
      },
    });

    // Add fallbacks for Node.js modules
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
      // Additional polyfills that might be needed
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
      }),
    ];

    // Add rules to handle specific modules
    config.module.rules.push({
      test: /\.m?js$/,
      resolve: {
        fullySpecified: false,
      },
    });

    // Handle @coinbase/cdp-sdk and its dependencies
    if (!isServer) {
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
};