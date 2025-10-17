/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config: any) => {
    config.optimization = {
      ...config.optimization,
      splitChunks: {
        ...config.optimization.splitChunks,
        cacheGroups: {
          ...config.optimization.splitChunks.cacheGroups,
          vendors: {
            test: /[\/]node_modules[\/]/,
            name: 'vendors',
            chunks: 'all',
          },
        },
      },
    };
    
    // Ensure proper module resolution for ES modules
    config.resolve = {
      ...config.resolve,
      extensionAlias: {
        '.js': ['.js', '.ts', '.tsx'],
        '.mjs': ['.mjs', '.ts', '.tsx'],
      },
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
    
    // Add plugins for polyfills
    config.plugins = [
      ...config.plugins,
      new config.webpack.ProvidePlugin({
        Buffer: ['buffer', 'Buffer'],
        process: 'process/browser',
      }),
    ];
    
    return config;
  },
  // Enable Turbopack for development
  turbopack: {},
};

export default nextConfig;
