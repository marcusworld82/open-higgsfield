import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    "/*": ["./node_modules/ffmpeg-static/**/*"],
  },
};

export default nextConfig;
