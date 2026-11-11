import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Hide the floating Next.js development indicator (the "N" badge).
  devIndicators: false,
  // A package-lock.json in a parent folder confuses root detection; pin it to this project.
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
};
export default nextConfig;
