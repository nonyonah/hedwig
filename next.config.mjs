import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

// Polyfill for Node.js built-ins
import { Buffer } from 'buffer';
import process from 'process';
import { dirname } from 'path';

// Ensure global objects are available
global.Buffer = Buffer;
global.process = process;

// Load environment variables from .env files
// Only load dotenv in local development (not on Netlify or production)
if (!process.env.NETLIFY && process.env.NODE_ENV !== 'production') {
  try {
    const dotenv = await import('dotenv');
    dotenv.config();
    // Also try to load from .env.production
    const envPath = path.resolve(process.cwd(), '.env.production');
    if (fs.existsSync(envPath)) {
      console.log('Loading environment variables from .env.production');
      const envConfig = dotenv.parse(fs.readFileSync(envPath));
      for (const key in envConfig) {
        if (!process.env[key]) {
          process.env[key] = envConfig[key];
        }
      }
    }
  } catch (err) {
    console.error('Error loading .env files in development:', err);
  }
} else {
  console.log('[ENV] Skipping dotenv loading: running on Netlify or in production. Environment variables are injected by Netlify or the platform.');
}

// Expose required environment variables to Next.js using the env key.
// This ensures variables are available at build and runtime, both on server and (if needed) client.
// Do NOT destructure process.env at the top-level for these variables.

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    CDP_API_KEY_ID: process.env.CDP_API_KEY_ID,
    CDP_API_KEY_SECRET: process.env.CDP_API_KEY_SECRET,
    CDP_WALLET_SECRET: process.env.CDP_WALLET_SECRET,
    CDP_NETWORK_ID: process.env.CDP_NETWORK_ID,
    PRIVY_APP_ID: process.env.PRIVY_APP_ID,
    PRIVY_APP_SECRET: process.env.PRIVY_APP_SECRET,
    WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN,
    WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID,
    WHATSAPP_VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN,
    NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
    ONCHAIN_KIT_API_KEY: process.env.ONCHAIN_KIT_API_KEY,
    NEXT_PUBLIC_CDP_API_KEY_ID: process.env.NEXT_PUBLIC_CDP_API_KEY_ID,
    NEXT_PUBLIC_NETWORK_ID: process.env.NEXT_PUBLIC_NETWORK_ID,
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    WALLET_ENCRYPTION_KEY: process.env.WALLET_ENCRYPTION_KEY,
    CDP_PROJECT_ID: process.env.CDP_PROJECT_ID,
    ALCHEMY_URL_ETH_SEPOLIA: process.env.ALCHEMY_URL_ETH_SEPOLIA,
    ALCHEMY_URL_BASE_SEPOLIA: process.env.ALCHEMY_URL_BASE_SEPOLIA, 
    NEXT_PUBLIC_FRONTEND: process.env.NEXT_PUBLIC_FRONTEND,
    NEXT_PUBLIC_PRIVY_APP_ID: process.env.NEXT_PUBLIC_PRIVY_APP_ID,
    PRIVY_AUTHORIZATION_PRIVATE_KEY: process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY,
    // ALCHEMY_API_KEY: process.env.ALCHEMY_API_KEY,
    // MORALIS_API_KEY: process.env.MORALIS_API_KEY,
    API_KEY_0X: process.env.API_KEY_0X,  
  },

  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
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
    
    // Use conditionally for browser polyfills
    const fallbacks = {
      fs: false,
      net: false,
      tls: false,
      dns: false,
      child_process: false
    };
    
    if (!isServer) {
      // Only include browser polyfills for client-side code
      fallbacks.crypto = 'crypto-browserify';
      fallbacks.stream = 'stream-browserify';
      fallbacks.buffer = 'buffer/';
      fallbacks.util = 'util/';
      fallbacks.assert = 'assert/';
      fallbacks.path = 'path-browserify';
      fallbacks.process = 'process/browser';
      fallbacks.os = 'os-browserify/browser';
      fallbacks.https = 'https-browserify';
      fallbacks.http = 'stream-http';
      fallbacks.zlib = 'browserify-zlib';
      fallbacks.querystring = 'querystring-es3';
      fallbacks.url = 'url/';
      fallbacks['whatwg-url'] = 'whatwg-url';
    }
    
    config.resolve.fallback = {
      ...config.resolve.fallback,
      ...fallbacks
    };
    
    config.plugins.push(
      new nextWebpack.ProvidePlugin({
        process: 'process/browser',
        Buffer: ['buffer', 'Buffer'],
      })
    );
    

    
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
