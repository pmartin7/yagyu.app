import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

import { importEsm } from './import-esm.js';

describe('importEsm', () => {
  it('is a function', () => {
    expect(typeof importEsm).toBe('function');
  });

  it('ai.service.ts does not statically import ESM-only @ai-sdk packages', () => {
    const source = readFileSync(resolve(__dirname, 'ai.service.ts'), 'utf8');
    // Value imports (`from '@ai-sdk/…'`) become require() under CJS emit.
    // `import type` / `typeof import(…)` are erased and are fine.
    expect(source).not.toMatch(/from ['"]@ai-sdk\//);
    expect(source).not.toMatch(/^import\s+(?!type\b).*\bfrom ['"]ai['"]/m);
    expect(source).toContain('importEsm');
  });
});
