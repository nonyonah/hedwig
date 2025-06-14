import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);

// Polyfill for Node.js built-ins
import { Buffer } from 'buffer';
import process from 'process';
import { fileURLToPath as _fileURLToPath } from 'url';
import { dirname } from 'path';

// Ensure global objects are available
global.Buffer = Buffer;
global.process = process;

// Load environment variables from .env files
require('dotenv').config();
// Also try to load from .env.production
try {
  const envPath = path.resolve(process.cwd(), '.env.production');
  if (fs.existsSync(envPath)) {
    console.log('Loading environment variables from .env.production');
    const envConfig = require('dotenv').parse(fs.readFileSync(envPath));
    for (const key in envConfig) {
      if (!process.env[key]) {
        process.env[key] = envConfig[key];
      }
    }
  }
} catch (err) {
  console.error('Error loading .env.production:', err);
}

// Hard-code critical environment variables if they are not set
if (!process.env.CDP_API_KEY_ID) {
  process.env.CDP_API_KEY_ID = "7f01cde6-cb23-4677-8d6f-3bca08d597dc";
}

if (!process.env.CDP_API_KEY_SECRET) {
  process.env.CDP_API_KEY_SECRET = "5LZgD6J5/6gsqKRM2G7VSp3KgO6uiB/4ZrxvlLkYafv+D15/Da+7q0HbBGExXN0pjzoZqRgZ24yMbT7yav0iLg==";
}

if (!process.env.WHATSAPP_ACCESS_TOKEN) {
  process.env.WHATSAPP_ACCESS_TOKEN = "EAA1khMe7o7wBOzZBrdCWID9s2Ecrw6RpBWr72gVB64w4ProZBSrOP3HyRHHrb3QjPFeLwEkjAjoZAG6rdeYLYEyULZCvuFyQz8yQjqk3qI7mARsVEZCTB9th704Ma9FALORvO5ZAhaDKUNH3yV3iOUIsvPIsIDFvsCsZAZCr6bezTHsdB2629NqlVlmpmJgWnAeZC2ERpoyMQs8rfeXxiPPZCusABRZCEypFz2Wyobvf4sg";
}

if (!process.env.WHATSAPP_PHONE_NUMBER_ID) {
  process.env.WHATSAPP_PHONE_NUMBER_ID = "592458597294251";
}

// Load environment variables with defaults
const {
  // Wallet and Blockchain
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID = '59972ef7bbe74749333c1b2267265a47',
  NEXT_PUBLIC_ONCHAIN_KIT_API_KEY = 'aAOzNl0p1r6KoYVHqbbMbcCuNKfEodLX',
  
  // CDP v2 Wallet Configuration
  NEXT_PUBLIC_CDP_API_KEY_ID = '7f01cde6-cb23-4677-8d6f-3bca08d597dc',
  NEXT_PUBLIC_CDP_API_KEY_SECRET = '5LZgD6J5/6gsqKRM2G7VSp3KgO6uiB/4ZrxvlLkYafv+D15/Da+7q0HbBGExXN0pjzoZqRgZ24yMbT7yav0iLg==',
  NEXT_PUBLIC_CDP_WALLET_SECRET = 'MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgrFql34xV8vr+Qmojg74E5ijn+wufniZcxdVVK+hdaKmhRANCAASvNTJCi2rg3eFdQxKL1xYWiKOf7kzYEYZM0AfKezWULZOZXKKmGFLgEINQAWBFxLnlxpLDs+GBXKX0JXZxIcAJ',
  NEXT_PUBLIC_NETWORK_ID = 'base-sepolia',
  
  // Google
  NEXT_PUBLIC_GOOGLE_API_KEY = 'AIzaSyBGUlMyBS1nsPLVbvFEh-bE5A39Z2---UQ',
  GOOGLE_GENERATIVE_AI_API_KEY = 'AIzaSyCLFHjrH-mcTAax95P0yMt_6ESOjr6FwN0',
  
  // Supabase
  NEXT_PUBLIC_SUPABASE_URL = 'https://zzvansqojcmavxqdmgcz.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6dmFuc3FvamNtYXZ4cWRtZ2N6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM4MDUxMDQsImV4cCI6MjA1OTM4MTEwNH0.wR38Zs0WtXEXeATk9uRPXWRG6gRqGi7Pud6aLymgNRM',
  
  // WhatsApp
  WHATSAPP_ACCESS_TOKEN = 'EAA1khMe7o7wBOzZBrdCWID9s2Ecrw6RpBWr72gVB64w4ProZBSrOP3HyRHHrb3QjPFeLwEkjAjoZAG6rdeYLYEyULZCvuFyQz8yQjqk3qI7mARsVEZCTB9th704Ma9FALORvO5ZAhaDKUNH3yV3iOUIsvPIsIDFvsCsZAZCr6bezTHsdB2629NqlVlmpmJgWnAeZC2ERpoyMQs8rfeXxiPPZCusABRZCEypFz2Wyobvf4sg',
  WHATSAPP_PHONE_NUMBER_ID = '592458597294251',
  WHATSAPP_VERIFY_TOKEN = 'hedwig_agent'
} = process.env;

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
