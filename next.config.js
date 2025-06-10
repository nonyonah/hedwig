/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  // Enable experimental ESM support
  experimental: {
    esmExternals: 'loose',
    // Use serverComponentsExternalPackages instead of transpilePackages
    // to avoid conflicts with ESM dependencies
    serverComponentsExternalPackages: [
      '@coinbase/agentkit',
      '@walletconnect/universal-provider',
      '@reown/appkit',
      'jose',
      '@coinbase/cdp-sdk'
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
      topLevelAwait: true,
      layers: true,
    };

    // Make sure we have the required polyfills
    const fallback = config.resolve.fallback || {};
    
    // Add fallbacks for Node.js modules
    Object.assign(fallback, {
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
      http: require.resolve('stream-http'),
      url: require.resolve('url/'),
      path: require.resolve('path-browserify'),
      zlib: require.resolve('browserify-zlib'),
      querystring: require.resolve('querystring-es3'),
      process: require.resolve('process/browser'),
    });

    config.resolve.fallback = fallback;

    // Add polyfills for Node.js modules
    config.plugins = (config.plugins || []).concat([
      new webpack.ProvidePlugin({
        process: 'process/browser',
        Buffer: ['buffer', 'Buffer'],
      }),
    ]);

    // Add rule to handle ESM modules
    config.module.rules.push({
      test: /\.m?js$/,
      resolve: {
        fullySpecified: false,
      },
    });

    // Handle @coinbase/cdp-sdk specific issues
    config.module.rules.push({
      test: /\.js$/,
      include: /node_modules\/@coinbase\/cdp-sdk/,
      use: {
        loader: 'babel-loader',
        options: {
          presets: ['@babel/preset-env'],
          plugins: ['@babel/plugin-transform-runtime'],
        },
      },
    });

    // Ensure proper resolution of @coinbase/cdp-sdk
    config.resolve.alias = {
      ...config.resolve.alias,
      '@coinbase/cdp-sdk': require.resolve('@coinbase/cdp-sdk'),
    };

    return config;
  },
};