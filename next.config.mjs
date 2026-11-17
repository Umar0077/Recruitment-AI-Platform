import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.INTERVIEWOS_RECORDING_LAB === "1" && process.env.NODE_ENV === "production") throw new Error("The fictional recording lab cannot be built or served in production mode.");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Separate output avoids dev/build cache collisions with the real-applicant frontend.
  distDir: process.env.INTERVIEWOS_RECORDING_LAB === "1" && process.env.NODE_ENV !== "production" ? ".next-recording-lab" : ".next",
  reactStrictMode: true,
  poweredByHeader: false,
  // Hide the floating Next.js development indicator (the "N" badge).
  devIndicators: false,
  // A package-lock.json in a parent folder confuses root detection; pin it to this project.
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "motion",
      "recharts",
      "@radix-ui/react-accordion",
      "@radix-ui/react-checkbox",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-popover",
      "@radix-ui/react-select",
      "@radix-ui/react-slot",
      "@radix-ui/react-switch",
      "@radix-ui/react-tabs",
      "@radix-ui/react-tooltip",
      "@tanstack/react-query",
      "@tanstack/react-table",
    ],
  },
};
export default nextConfig;
