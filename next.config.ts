import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  turbopack: {
    resolveAlias: {
      // Dedupe yjs so Hocuspocus + Tiptap Collaboration share one instance.
      yjs: "./node_modules/yjs/index.js",
    },
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      yjs: require("node:path").resolve(__dirname, "node_modules/yjs"),
    };
    return config;
  },
};

export default nextConfig;
