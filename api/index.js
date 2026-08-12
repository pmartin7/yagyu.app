// Vercel serverless entry for the NestJS API. It only requires compiled
// apps/api output so module resolution happens from apps/api/node_modules
// (pnpm's isolated linker installs no packages at the repo root). All /api/*
// requests are rewritten here (see vercel.json); Nest's global 'api' prefix
// matches the original URL, which Vercel preserves through the rewrite.

// NFT pin for importEsm AI packages. Must not throw — a failed resolve here
// takes down /api/health. Build-time analysis still sees the require().
try {
  require('./ai-sdk-pins.cjs');
} catch (error) {
  console.error('AI SDK NFT pin failed', error instanceof Error ? error.message : String(error));
}

const { api } = require('../apps/api/dist/serverless.js');

module.exports = api;
