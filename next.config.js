/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@coinbase/cdp-sdk', 'jose'],
  // Enable experimental ESM support
  experimental: {
    esmExternals: 'loose',
    serverComponentsExternalPackages: [
      '@coinbase/agentkit',
      '@walletconnect/universal-provider',
      '@reown/appkit'
    ],
  },

  // Expose environment variables to the build process
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
      topLevelAwait: true,
    };

    // Add fallbacks for Node.js modules
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: 'crypto-browserify',
        stream: 'stream-browserify',
        buffer: 'buffer',
        util: 'util',
        assert: 'assert',
        os: 'os-browserify/browser',
        https: 'https-browserify',
        http: 'http-browserify',
        url: 'url'
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
    config.plugins.push(
      new webpack.ProvidePlugin({
        process: 'process/browser',
        Buffer: ['buffer', 'Buffer'],
      })
    );

    // Add rule to handle jose module
    config.module.rules.push({
      test: /\.m?js$/,
      resolve: {
        fullySpecified: false
      }
    });

    return config;
  },
};

module.exports = nextConfig;