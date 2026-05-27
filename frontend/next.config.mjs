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
  // Tell Next.js to treat these heavy Node.js packages as external (don't bundle them)
  // This prevents "Collecting page data" build failures on Vercel
  experimental: {
    serverComponentsExternalPackages: [
      "pdf-parse",
      "pdfjs-dist",
      "canvas",
      "mammoth",
      "@langchain/google-genai",
      "@langchain/core",
      "@langchain/pinecone",
      "langchain",
      "@pinecone-database/pinecone",
      "nodemailer",
    ],
  },
  // Webpack fallback for any edge cases
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : []),
        "pdf-parse",
        "pdfjs-dist",
        "canvas",
        "mammoth",
      ]
    }
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
