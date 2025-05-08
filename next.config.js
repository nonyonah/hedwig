/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    // Increase chunk loading timeout to 60 seconds
    config.watchOptions = {
      ...config.watchOptions,
      aggregateTimeout: 60000,
    };
    return config;
  },
};

module.exports = nextConfig;