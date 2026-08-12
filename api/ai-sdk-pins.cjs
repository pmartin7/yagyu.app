// Pin AI SDK + transitive deps for Vercel NFT. Runtime loads them via
// importEsm() (invisible to the tracer). createRequire from apps/api walks
// the real pnpm graph (nested zod under provider-utils, eventsource-parser).
// Do not use require.resolve(id, { paths }) — NFT ignores that form.
'use strict';

const path = require('path');
const { createRequire } = require('module');

const requireFromApi = createRequire(path.join(__dirname, '../apps/api/package.json'));

const roots = ['@ai-sdk/anthropic', '@ai-sdk/openai', 'ai', 'zod'].map((id) =>
  requireFromApi.resolve(id),
);

for (const entry of roots) {
  const requireFromPkg = createRequire(entry);
  for (const id of ['@ai-sdk/provider-utils', 'eventsource-parser', 'zod']) {
    try {
      requireFromPkg.resolve(id);
    } catch {
      // Not every root depends on every transitive.
    }
  }
}
