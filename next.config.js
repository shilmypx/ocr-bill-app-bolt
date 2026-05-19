// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (process.env.VERCEL) {
      config.cache = false  // disable webpack cache on Vercel
    }
    return config
  },
}

module.exports = nextConfig

