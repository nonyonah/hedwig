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

// Load environment variables with defaults
const {
  // Wallet and Blockchain
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID = '',
  NEXT_PUBLIC_ONCHAIN_KIT_API_KEY = '',
  
  // CDP v2 Wallet Configuration
  NEXT_PUBLIC_CDP_API_KEY_ID = '',
  NEXT_PUBLIC_CDP_API_KEY_SECRET = '',
  NEXT_PUBLIC_CDP_WALLET_SECRET = '',
  NEXT_PUBLIC_NETWORK_ID = 'base-sepolia',
  
  // Google
  NEXT_PUBLIC_GOOGLE_API_KEY = '',
  GOOGLE_GENERATIVE_AI_API_KEY = '',
  
  // Supabase
  NEXT_PUBLIC_SUPABASE_URL = '',
  NEXT_PUBLIC_SUPABASE_ANON_KEY = '',
  
  // WhatsApp
  WHATSAPP_ACCESS_TOKEN = '',
  WHATSAPP_PHONE_NUMBER_ID = '',
  WHATSAPP_VERIFY_TOKEN = ''
} = process.env;

// Load environment variables if .env file exists
require('dotenv').config();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  publicRuntimeConfig: {
    walletConnectProjectId: NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
    onchainKitApiKey: NEXT_PUBLIC_ONCHAIN_KIT_API_KEY,
    cdp: {
      apiKeyId: NEXT_PUBLIC_CDP_API_KEY_ID,
      networkId: NEXT_PUBLIC_NETWORK_ID,
      walletType: 'v2'
    },
    googleApiKey: NEXT_PUBLIC_GOOGLE_API_KEY,
    supabaseUrl: NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: NEXT_PUBLIC_SUPABASE_ANON_KEY,
    whatsappPhoneNumberId: WHATSAPP_PHONE_NUMBER_ID,
    whatsappVerifyToken: WHATSAPP_VERIFY_TOKEN
  },
  serverRuntimeConfig: {
    cdp: {
      apiKeyId: NEXT_PUBLIC_CDP_API_KEY_ID,
      apiKeySecret: NEXT_PUBLIC_CDP_API_KEY_SECRET,
      walletSecret: NEXT_PUBLIC_CDP_WALLET_SECRET,
      networkId: NEXT_PUBLIC_NETWORK_ID
    },
    googleGenerativeAiApiKey: GOOGLE_GENERATIVE_AI_API_KEY,
    whatsapp: {
      accessToken: WHATSAPP_ACCESS_TOKEN,
      phoneNumberId: WHATSAPP_PHONE_NUMBER_ID,
      verifyToken: WHATSAPP_VERIFY_TOKEN
    }
  },
  output: 'standalone',
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  images: {
    unoptimized: true,
  },
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
  webpack: (config, { isServer, webpack: nextWebpack }) => {
    config.experiments = {
      ...config.experiments,
      layers: true,
      asyncWebAssembly: true,
      topLevelAwait: true,
    };
    config.module.rules.push({
      test: /\.m?js$/,
      resolve: { fullySpecified: false },
      exclude: /node_modules\/(?!@coinbase)/,
    });
    config.module.rules.push({
      test: /\.c?js$/,
      resolve: { fullySpecified: false },
      include: /node_modules\/jose/,
      type: 'javascript/auto',
    });
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
    config.module.rules.push({
      test: /whatwg-url\/.*\.js$/,
      type: 'javascript/auto',
      resolve: { fullySpecified: false }
    });
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        'jose': 'jose',
        'node:crypto': 'crypto-browserify',
        'node:stream': 'stream-browserify',
        'node:buffer': 'buffer/'
      };
    }
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    return config;
  },
};

export default nextConfig;
