import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 隱藏開發工具指示器
  devIndicators: false,

  // 允許外部圖片域名
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'shoplineimg.com' },
      { protocol: 'https', hostname: 'img.shoplineapp.com' },
      { protocol: 'https', hostname: 'wlwklnictyowdnmzronw.supabase.co' },
      { protocol: 'https', hostname: 'cdn.shopify.com' },
      { protocol: 'https', hostname: '*.waca.ec' },
      { protocol: 'https', hostname: '*.waca.tw' },
    ],
  },
};

export default nextConfig;
