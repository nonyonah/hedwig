/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Turbopack configuration for Next.js 16+
  // Empty config to silence the warning - most apps work fine with default Turbopack settings
  turbopack: {},
  // Keep webpack config for backward compatibility when not using Turbopack
  webpack: (config: any) => {
    // Simplified webpack config to avoid memory issues
    config.resolve = {
      ...config.resolve,
      fallback: {
        ...config.resolve.fallback,
        // Handle React Native dependencies that don't exist in web environment
        '@react-native-async-storage/async-storage': false,
        'react-native': false,
        'react-native-get-random-values': false,
        'react-native-keychain': false,
        '@react-native-community/netinfo': false,
        'react-native-device-info': false,
        'react-native-fs': false,
        'react-native-svg': false,
        'react-native-webview': false,
        fs: false,
        net: false,
        tls: false,
      },
    };
    
    return config;
  },
  // Experimental features
  experimental: {},
};

export default nextConfig;
