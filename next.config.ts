import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/*": ["./supabase/migrations/*.sql"],
  },
  serverExternalPackages: ["pdfjs-dist", "pg"],
};

export default nextConfig;
