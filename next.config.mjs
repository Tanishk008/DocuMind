/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Prevent webpack from trying to bundle Node-only packages like pdf-parse / pdfjs-dist
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : []),
        "pdf-parse",
        "pdfjs-dist",
        "canvas",
      ]
    }
    return config
  },
}

export default nextConfig
