// Nest/tsc emit CommonJS and rewrite `import()` to `require()`. AI SDK
// packages are ESM-only, so that rewrite becomes ERR_REQUIRE_ESM at runtime
// on Vercel. `new Function` yields a real native dynamic import that tsc
// cannot rewrite.
export function importEsm<T = unknown>(specifier: string): Promise<T> {
  const load = new Function('specifier', 'return import(specifier)') as (id: string) => Promise<T>;
  return load(specifier);
}
