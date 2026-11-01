import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ["127.0.0.1"],
  // 輸出成靜態網頁（out 資料夾），放在 Cloudflare Pages；部署前必須先用 Cloudflare Access 上鎖。
  output: "export",
};

export default nextConfig;
