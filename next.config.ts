import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["ffmpeg-static"],
  // The ffmpeg binary is found at runtime, so tracing misses it. Include it
  // through pnpm's real store path: node_modules/ffmpeg-static is a symlink,
  // and Vercel rejects function files that sit under a symlinked directory.
  // Only the studio page runs server actions, so only it needs the binary.
  outputFileTracingIncludes: {
    "/": ["./node_modules/.pnpm/ffmpeg-static@*/node_modules/ffmpeg-static/ffmpeg"],
  },
};

export default nextConfig;
