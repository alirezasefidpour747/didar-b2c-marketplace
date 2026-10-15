import type { NextConfig } from "next"
const config: NextConfig = { output: "standalone", transpilePackages: [], experimental: { cpus: 2 } }
export default config
