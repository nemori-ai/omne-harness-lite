import { execFileSync } from 'node:child_process'
import { expect, test } from 'vitest'
import { LosslessNumber } from '@omne-harness-lite/content-blocks'
import { decodeContextData } from '../src/index.ts'

test('the shared data boundary rejects live values, malformed dates and unknown fields', () => {
  const value = {
    key: 'k',
    revision: 'r',
    observedAt: '2026-10-06T00:00:00Z',
    value: { n: new LosslessNumber('9007199254740993') },
  }
  const result = decodeContextData('Value', value)
  expect(result?.value).toEqual(value.value)
  expect(Object.isFrozen(result?.value)).toBe(true)
  expect(
    decodeContextData('Value', { ...value, observedAt: '2026-02-30T00:00:00Z' }),
  ).toBeUndefined()
  expect(decodeContextData('Value', { ...value, extra: true })).toBeUndefined()
  expect(decodeContextData('Value', { ...value, value: () => 'live' })).toBeUndefined()
})

test('a nonempty seed captures every initial value and rejects one invalid observation date', () => {
  const seed = {
    required: [],
    fixed: [],
    initial: [
      { key: 'first', revision: 'one', observedAt: '2026-10-06T00:00:00Z', value: 'original' },
      { key: 'second', revision: 'two', observedAt: '2026-10-06T00:00:01.123Z', value: 'second' },
    ],
  }
  const captured = decodeContextData('Seed', seed)
  expect(captured).toEqual(seed)
  const first = seed.initial[0]
  if (!first) throw new Error('fixture needs an initial value')
  first.value = 'changed'
  expect(captured?.initial[0]?.value).toBe('original')
  expect(Object.isFrozen(captured?.initial)).toBe(true)
  expect(
    decodeContextData('Seed', {
      ...seed,
      initial: [seed.initial[0], { ...seed.initial[1], observedAt: '2026-02-30T00:00:00Z' }],
    }),
  ).toBeUndefined()
})

test('root import is kernel-free and shared schema validation remains lazy and natively cached', () => {
  const text = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import { createRequire } from 'node:module';
    const require = createRequire(process.cwd() + '/package.json');
    const file = require.resolve('./generated/ordinary.cjs');
    const api = await import('@omne-harness-lite/runtime-context');
    if (Object.keys(require.cache).some(name => name.includes('@deepseek-ai'))) throw Error('root loaded kernel');
    if (require.cache[file]) throw Error('eager schema load');
    const seed = {required:[], initial:[], fixed:[]};
    if (!api.decodeContextData('Seed', seed)) throw Error('valid seed rejected');
    const cached = require.cache[file];
    api.decodeContextData('Seed', seed);
    if (!cached || require.cache[file] !== cached) throw Error('cache not retained');
    console.log('shared-lazy-cache: passed');
  `,
    ],
    { encoding: 'utf8' },
  )
  expect(text.trim()).toBe('shared-lazy-cache: passed')
})
