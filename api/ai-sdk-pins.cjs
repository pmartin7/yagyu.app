// Pin AI SDK + transitive deps for Vercel NFT. Runtime loads them via
// importEsm() (invisible to the tracer). createRequire from this file walks
// the hoisted node_modules graph (see root .npmrc node-linker=hoisted).
// Do not use require.resolve(id, { paths }) — NFT ignores that form.
'use strict';

const { createRequire } = require('module');

const requireFromHere = createRequire(__filename);

for (const id of [
  '@ai-sdk/anthropic',
  '@ai-sdk/openai',
  '@ai-sdk/gateway',
  '@ai-sdk/provider',
  '@ai-sdk/provider-utils',
  'ai',
  'zod',
  'eventsource-parser',
  'json-schema',
  '@standard-schema/spec',
  '@workflow/serde',
  'undici',
  '@vercel/oidc',
]) {
  try {
    requireFromHere.resolve(id);
  } catch {
    // Optional peer / unused transitive.
  }
}
