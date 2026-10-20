/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  distDir: process.env.NEXT_DIST_DIR || ".next",
  transpilePackages: ["@excalidraw/excalidraw"],
};

module.exports = nextConfig;
