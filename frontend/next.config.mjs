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
  // All document extraction / AI / email packages (pdf-parse, mammoth, langchain,
  // nodemailer, etc.) now live only in the Express backend — the frontend no longer
  // imports any of them, so no externals/webpack config is needed for them here.
  webpack: (config) => {
    // Prevent browser bundle from trying to polyfill Node built-ins
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
      child_process: false,
      worker_threads: false,
    }
    return config
  },
}

export default nextConfig
