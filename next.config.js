import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import webpack from 'webpack';
import path from 'path';

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


// Load environment variables if .env file exists
require('dotenv').config();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  
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
  
  // Configure webpack
  webpack: (config, { isServer, webpack }) => {
    config.experiments = {
      ...config.experiments,
      layers: true,
      asyncWebAssembly: true,
      topLevelAwait: true,
    };

    // Add rule to handle .mjs files
    config.module.rules.push({
      test: /\.m?js$/,
      resolve: {
        fullySpecified: false,
      },
      exclude: /node_modules\/(?!@coinbase)/,
    });

    // Add rule to handle .cjs files
    config.module.rules.push({
      test: /\.c?js$/,
      resolve: {
        fullySpecified: false,
      },
      include: /node_modules\/jose/,
      type: 'javascript/auto',
    });

    // Configure fallbacks for Node.js built-ins
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
      dns: false,
      child_process: false,
      crypto: require.resolve('crypto-browserify'),
      stream: require.resolve('stream-browserify'),
      buffer: require.resolve('buffer/'),
      util: require.resolve('util/'),
      assert: require.resolve('assert/'),
      path: require.resolve('path-browserify'),
      process: require.resolve('process/browser'),
      os: require.resolve('os-browserify/browser'),
      https: require.resolve('https-browserify'),
      http: require.resolve('stream-http'),
      zlib: require.resolve('browserify-zlib'),
      querystring: require.resolve('querystring-es3'),
      url: require.resolve('url/')
    };

    // Add plugins for global polyfills
    config.plugins = [
      ...config.plugins,
      new webpack.ProvidePlugin({
        process: 'process/browser',
        Buffer: ['buffer', 'Buffer'],
        crypto: 'crypto-browserify',
        stream: 'stream-browserify',
        util: 'util/'
      })
    ];
    
    // Configure aliases for client-side
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        'jose': require.resolve('jose/dist/node/cjs/index.js'),
        'node:crypto': 'crypto-browserify',
        'node:stream': 'stream-browserify',
        'node:buffer': 'buffer/'
      };
      
      config.resolve.alias = Object.entries({
        ...config.resolve.alias,
        './src/chacha20Poly1305.js': false,
        'jose': false
      }).reduce((acc, [key, value]) => {
        if (value !== false) {
          acc[key] = value;
        }
        return acc;
      }, {});
    }

    // Get the directory name using import.meta.url (works in both Windows and Unix-like systems)
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    
    // For both server and client, use the main jose export
    config.resolve.alias = {
      ...config.resolve.alias,
      'jose': 'jose'
    };
    
    // Handle specific jose imports that might be causing issues
    config.resolve.alias = Object.entries({
      ...config.resolve.alias,
      './src/chacha20Poly1305.js': false,
      'jose/browser/index': 'jose',
      'jose/node/cjs': 'jode',
      'jose/node/cjs/index': 'jose',
      'jose/node/cjs/jwt/verify': 'jose/jwt/verify',
      'jose/node/cjs/jws/compact/verify': 'jose/jws/compact/verify',
      'jose/node/cjs/jwk/import': 'jose/jwk/import'
    }).reduce((acc, [key, value]) => {
      if (value !== false) {
        acc[key] = value;
      }
      return acc;
    }, {});

    return config;
  },
};

export default nextConfig;
