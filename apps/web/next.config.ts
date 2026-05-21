import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Expose only safe env vars to the browser bundle
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1',
  },
}

export default nextConfig
