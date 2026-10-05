import { execFileSync } from 'node:child_process'
import { expect, test } from 'vitest'

test('fixed codec loads on first validation and reuses the native module cache', () => {
  const result = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import { createRequire } from 'node:module';
    const require = createRequire(process.cwd() + '/package.json');
    const generated = require.resolve('./generated/ordinary.cjs');
    const api = await import('@omne-harness-lite/runtime-context-local');
    await import('@omne-harness-lite/runtime-context-local/cordis');
    if (require.cache[generated]) throw Error('eager fixed validator');
    const initializer = api.createContextSessionInitializer({
      readSince: async () => ({entries: [], tail: 0}),
      readByKey: async () => ({entries: [], tail: 0}),
      append: async () => ({positions: [1], tail: 1}),
    });
    if (require.cache[generated]) throw Error('eager factory validation');
    const scope = { tenant: {organization:'org',account:'alice'}, session:'session' };
    const seed = {required:[],initial:[],fixed:[]};
    const first = await initializer.initializeContextSession(scope, seed);
    if (first.kind !== 'applied') throw Error('first validation failed');
    const cached = require.cache[generated];
    if (!cached) throw Error('validator not cached');
    await initializer.initializeContextSession(scope, seed);
    if (require.cache[generated] !== cached) throw Error('validator reloaded');
    console.log('lazy-native-cache: passed');
  `,
    ],
    { encoding: 'utf8' },
  )
  expect(result.trim()).toBe('lazy-native-cache: passed')
})
