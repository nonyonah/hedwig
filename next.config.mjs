import { createRequire } from 'module';
import webpack from 'webpack';

const require = createRequire(import.meta.url);

// Load environment variables
const {
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
  NEXT_PUBLIC_ONCHAIN_KIT_API_KEY,
  NEXT_PUBLIC_CDP_API_KEY_NAME,
  NEXT_PUBLIC_CDP_API_KEY_SECRET,
  NEXT_PUBLIC_GOOGLE_API_KEY,
  NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY,
  GOOGLE_GENERATIVE_AI_API_KEY,
  WHATSAPP_ACCESS_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID,
  WEBHOOK_VERIFY_TOKEN
} = process.env;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  // Public environment variables
  publicRuntimeConfig: {
    walletConnectProjectId: NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
    onchainKitApiKey: NEXT_PUBLIC_ONCHAIN_KIT_API_KEY,
    cdpApiKeyName: NEXT_PUBLIC_CDP_API_KEY_NAME,
    googleApiKey: NEXT_PUBLIC_GOOGLE_API_KEY,
    supabaseUrl: NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
  
  // Server-side environment variables
  serverRuntimeConfig: {
    cdpApiKeySecret: NEXT_PUBLIC_CDP_API_KEY_SECRET,
    googleGenerativeAiKey: GOOGLE_GENERATIVE_AI_API_KEY,
    whatsappAccessToken: WHATSAPP_ACCESS_TOKEN,
    whatsappPhoneNumberId: WHATSAPP_PHONE_NUMBER_ID,
    webhookVerifyToken: WEBHOOK_VERIFY_TOKEN,
  },
  
  // Output directory for Netlify
  output: 'standalone',
  
  // Disable static optimization for Netlify
  outputFileTracing: true,
  
  // Enable server actions
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  
  // Disable static optimization for Netlify
  images: {
    unoptimized: true,
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
