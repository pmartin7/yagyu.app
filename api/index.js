// Vercel serverless entry for the NestJS API. It only requires compiled
// apps/api output so module resolution happens from apps/api/node_modules
// (pnpm's isolated linker installs no packages at the repo root). All /api/*
// requests are rewritten here (see vercel.json); Nest's global 'api' prefix
// matches the original URL, which Vercel preserves through the rewrite.
const path = require('path');

// Pin ESM-only AI SDK packages for Vercel NFT. Runtime loads them via
// importEsm() (new Function + native import), which the tracer cannot see —
// without this resolve, /var/task lacks @ai-sdk/* and analyze jobs fail.
const apiRoot = path.join(__dirname, '../apps/api');
for (const specifier of ['@ai-sdk/anthropic', '@ai-sdk/openai', 'ai']) {
  require.resolve(specifier, { paths: [apiRoot] });
}

const { api } = require('../apps/api/dist/serverless.js');

module.exports = api;
