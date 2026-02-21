import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 隱藏開發工具指示器
  devIndicators: false,

  // 允許外部圖片域名
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
};

export default nextConfig;
