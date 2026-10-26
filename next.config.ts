import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // 在线对战 relay 由 instrumentation.ts 随服务启动（端口 3004）
  serverExternalPackages: ["socket.io"],
};

export default nextConfig;
