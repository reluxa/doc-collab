import type { NextConfig } from "next";

const extraDevOrigins = process.env.ALLOWED_DEV_ORIGINS
  ? process.env.ALLOWED_DEV_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  : [];

const nextConfig: NextConfig = {
  // Required when browsing via WSL IP from Windows (e.g. 172.17.x.x).
  allowedDevOrigins: ["127.0.0.1", "localhost", ...extraDevOrigins],
  // Keep Yjs/Hocuspocus as Node externals — avoids Turbopack bundling the CRDT graph.
  serverExternalPackages: [
    "yjs",
    "y-protocols",
    "lib0",
    "@hocuspocus/server",
    "@hocuspocus/transformer",
    "crossws",
    "ws",
  ],
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
