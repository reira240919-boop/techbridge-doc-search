/** @type {import('next').NextConfig} */
const nextConfig = {
  // 立ち上げるたびに AGENTS.md を作らない
  agentRules: false,
  // PDF を返す受け口が、公開したときも PDF 本体を読めるようにする
  outputFileTracingIncludes: {
    "/api/pdf/[name]": ["./case3-*.pdf"],
  },
};

export default nextConfig;
