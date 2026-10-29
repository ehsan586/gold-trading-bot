import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone output is only enabled when building the Docker image
  output: process.env.DOCKER_BUILD === "true" ? "standalone" : undefined,
};

export default nextConfig;
