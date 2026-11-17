import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: { position: "bottom-right" },
  // Native/binary packages used only on the server (FFmpeg, ONNX runtime).
  serverExternalPackages: ["ffmpeg-static", "ffprobe-static", "@huggingface/transformers", "onnxruntime-node"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  experimental: {
    // Evidence uploads go through route handlers; allow large bodies there.
    proxyClientMaxBodySize: "500mb",
  },
};

export default nextConfig;
