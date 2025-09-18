/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    typedRoutes: true,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  // Environment variables accessible in the browser
  env: {
    // These will be available at build time and runtime
    NEXT_PUBLIC_ENV: process.env.NEXT_PUBLIC_ENV || 'development',
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL || '',
    NEXT_PUBLIC_API_TIMEOUT: process.env.NEXT_PUBLIC_API_TIMEOUT || '',
    NEXT_PUBLIC_DEBUG: process.env.NEXT_PUBLIC_DEBUG || 'false',
  },
  // Validate required environment variables for production builds
  webpack: (config, { isServer, dev }) => {
    if (!dev && !isServer && process.env.NODE_ENV === 'production') {
      // Validate production configuration
      const requiredEnvVars = ['NEXT_PUBLIC_API_URL'];
      const missingVars = requiredEnvVars.filter(
        (varName) => !process.env[varName] || process.env[varName] === 'http://localhost:3001'
      );

      if (missingVars.length > 0) {
        console.warn(
          `\n⚠️  Warning: The following environment variables should be configured for production:\n` +
          missingVars.map(v => `  - ${v}`).join('\n') + '\n'
        );
      }
    }
    return config;
  },
}

module.exports = nextConfig