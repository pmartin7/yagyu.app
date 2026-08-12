// Vercel serverless entry for the NestJS API. It only requires compiled
// apps/api output so module resolution happens from apps/api/node_modules
// (pnpm's isolated linker installs no packages at the repo root). All /api/*
// requests are rewritten here (see vercel.json); Nest's global 'api' prefix
// matches the original URL, which Vercel preserves through the rewrite.
require('./ai-sdk-pins.cjs');

const { api } = require('../apps/api/dist/serverless.js');

module.exports = api;
