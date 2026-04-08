import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ['react-markdown', 'remark', 'remark-parse', 'remark-rehype', 'unified', 'unist-util-visit', 'hast-util-to-jsx-runtime', 'vfile', 'vfile-message'],
};

export default nextConfig;
