import { expect, it } from 'vitest'
import { createMedia } from '@omne-harness/media'
import { createMemoryByteStore, createMemoryMediaIndex } from '@omne-harness/media-contract/testing'
import { CONFIG, fakeImage } from './world.ts'

it('exports the factory of the core', async () => {
  const entry = (await import('@omne-harness/media')) as Record<string, unknown>
  expect(Object.keys(entry)).toEqual(['createMedia'])
})

it('refuses to start without the store new objects go to', () => {
  expect(() =>
    createMedia({
      stores: [createMemoryByteStore()],
      writeTo: 'elsewhere',
      index: createMemoryMediaIndex(),
      image: fakeImage().codec,
      clock: { now: () => '2026-10-19T00:00:00.000Z' },
      newKey: () => '0'.repeat(32),
      config: CONFIG,
    }),
  ).toThrow('no byte store is named "elsewhere"')
})
