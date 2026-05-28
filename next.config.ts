import type { NextConfig } from "next";

const APP_NAME = "ig-slidemaker";

const isVercel = process.env.VERCEL === "1";

const BASE_PATH = isVercel ? "" : `/${APP_NAME}`;

const nextConfig: NextConfig = {
  output: "standalone",
  basePath: BASE_PATH,
  assetPrefix: isVercel ? undefined : BASE_PATH,
  trailingSlash: false,
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_BASE_PATH: BASE_PATH,
  },
  serverExternalPackages: ["pdfjs-dist", "sharp"],
};

export default nextConfig;
