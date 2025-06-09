// @ts-check
import crypto from 'crypto-browserify';
import stream from 'stream-browserify';
import buffer from 'buffer/';
import util from 'util/';
import assert from 'assert/';
import os from 'os-browserify/browser.js';
import https from 'https-browserify';
import http from 'http-browserify';
import url from 'url/';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable experimental ESM support
  experimental: {
    esmExternals: 'loose',
    serverComponentsExternalPackages: [
      '@coinbase/agentkit',
      '@walletconnect/universal-provider',
      'jose',
      'jose/*',
      '@coinbase/cdp-sdk',
      '@reown/appkit'
    ],
  },
  
  // Configure webpack
  webpack: (config, { isServer }) => {
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
        crypto: crypto,
        stream: stream,
        buffer: buffer,
        util: util,
        assert: assert,
        os: os,
        https: https,
        http: http,
        url: url
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
    config.resolve.alias = {
      ...config.resolve.alias,
      crypto: 'crypto-browserify',
      stream: 'stream-browserify',
      buffer: 'buffer/',
      util: 'util/',
      assert: 'assert/',
      os: 'os-browserify/browser',
      https: 'https-browserify',
      http: 'http-browserify',
      url: 'url/'
    };

    // Add rule to handle jose module
    config.module.rules.push({
      test: /\.m?js$/,
      resolve: {
        fullySpecified: false
      }
    });

    return config;
  },
  // Disable Turbopack as it might cause issues with some packages
  // turbopack: {},
};

export default nextConfig;