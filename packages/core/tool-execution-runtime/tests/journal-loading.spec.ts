import { execFileSync } from 'node:child_process'
import { expect, test } from 'vitest'

test(
  'loads the fixed journal graph only on demand and reuses the native module cache',
  { tags: ['slow'] },
  () => {
    // A separate native process checks actual package loading, outside Vitest's module transform.
    const codec = new URL('../dist/index.js', import.meta.url).href
    const manifest = new URL('../package.json', import.meta.url).href
    const output = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
    import assert from 'node:assert/strict';
    import { createRequire } from 'node:module';
    const require = createRequire(${JSON.stringify(manifest)});
    const path = require.resolve('./generated/tool-journal.cjs');
    const codec = await import(${JSON.stringify(codec)});
    assert.equal(require.cache[path], undefined);
    assert.deepEqual(codec.captureToolJournalValue({ revision: 2 }), { invalid: true });
    const first = require.cache[path]; assert.ok(first);
    codec.captureToolJournalValue({ revision: 2 });
    assert.equal(require.cache[path], first);
    assert.ok(!Object.keys(require.cache).some(path => path.includes('/ajv/dist/compile/') || path.endsWith('/ajv/dist/ajv.js')));
    console.log('journal-lazy-cache-ok');
  `,
      ],
      { encoding: 'utf8' },
    )
    expect(output.trim()).toBe('journal-lazy-cache-ok')
  },
)
