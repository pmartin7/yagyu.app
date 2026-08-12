import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// Nest/tsc emit CommonJS and rewrite `import()` to `require()`. AI SDK
// packages are ESM-only, so that rewrite becomes ERR_REQUIRE_ESM at runtime
// on Vercel. `new Function` yields a real native dynamic import that tsc
// cannot rewrite.
//
// Resolve with createRequire first so we import a file URL. Bare
// `import('@ai-sdk/…')` depends on a package-name layout that pnpm nested
// symlinks + Vercel file tracing often break in /var/task; the resolved
// absolute path matches what NFT/`includeFiles` actually shipped.
const requireFromHere = createRequire(__filename);

export function importEsm<T = unknown>(specifier: string): Promise<T> {
  const resolved = pathToFileURL(requireFromHere.resolve(specifier)).href;
  const load = new Function('url', 'return import(url)') as (id: string) => Promise<T>;
  return load(resolved);
}
