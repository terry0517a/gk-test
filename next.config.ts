import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 隱藏開發工具指示器
  devIndicators: false,

  // 跳過圖片優化，直接載入原圖
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
