import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);

// Polyfill for Node.js built-ins
import { Buffer } from 'buffer';
import process from 'process';
import { fileURLToPath as _fileURLToPath } from 'url';
import { dirname } from 'path';

// Ensure global objects are available
global.Buffer = Buffer;
global.process = process;

// Load environment variables
const {
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
  NEXT_PUBLIC_ONCHAIN_KIT_API_KEY,
  NEXT_PUBLIC_CDP_API_KEY_ID,
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
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
  typescript: {
    // !! WARN !!
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors.
    // !! WARN !!
    ignoreBuildErrors: true,
  },
  
  // Public environment variables
  publicRuntimeConfig: {
    // Wallet and Blockchain
    walletConnectProjectId: NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
    onchainKitApiKey: NEXT_PUBLIC_ONCHAIN_KIT_API_KEY,
    
    // CDP v2 Wallet Configuration
    cdp: {
      apiKeyName: NEXT_PUBLIC_CDP_API_KEY_NAME,
      apiKeyId: process.env.CDP_API_KEY_ID,
      networkId: process.env.NETWORK_ID || 'base-sepolia',
      walletType: 'v2'
    },
    
    // API Keys
    googleApiKey: NEXT_PUBLIC_GOOGLE_API_KEY,
    
    // Supabase
    supabaseUrl: NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: NEXT_PUBLIC_SUPABASE_ANON_KEY,
    
    // WhatsApp
    whatsappPhoneNumberId: WHATSAPP_PHONE_NUMBER_ID,
    whatsappVerifyToken: WEBHOOK_VERIFY_TOKEN
  },
  
  // Server-side environment variables
  serverRuntimeConfig: {
    cdpApiKeySecret: NEXT_PUBLIC_CDP_API_KEY_SECRET,
    googleGenerativeAiKey: GOOGLE_GENERATIVE_AI_API_KEY,
    whatsappAccessToken: WHATSAPP_ACCESS_TOKEN,
    whatsappPhoneNumberId: WHATSAPP_PHONE_NUMBER_ID,
    webhookVerifyToken: WEBHOOK_VERIFY_TOKEN,
  },
  
  // Output standalone for Netlify
  output: 'standalone',
  
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
  webpack: (config, { isServer, webpack: nextWebpack }) => {
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
      url: require.resolve('url/'),
      'whatwg-url': require.resolve('whatwg-url')
    };

    // Add plugins for global polyfills
    config.plugins = [
      ...config.plugins,
      new nextWebpack.ProvidePlugin({
        process: 'process/browser',
        Buffer: ['buffer', 'Buffer'],
        crypto: 'crypto-browserify',
        stream: 'stream-browserify',
        util: 'util/'
      })
    ];

    // Handle whatwg-url module
    config.module.rules.push({
      test: /whatwg-url\/.*\.js$/,
      type: 'javascript/auto',
      resolve: {
        fullySpecified: false
      }
    });
    
    // Configure aliases for client-side
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        'jose': 'jose',
        'node:crypto': 'crypto-browserify',
        'node:stream': 'stream-browserify',
        'node:buffer': 'buffer/'
      };
    }

    // Get the directory name using import.meta.url (works in both Windows and Unix-like systems)
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    return config;
  },
};

export default nextConfig;
