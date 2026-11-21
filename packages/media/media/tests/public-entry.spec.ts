import { expect, it } from 'vitest'
import { createMedia } from '@omne-harness/media'
import { createMemoryByteStore, createMemoryMediaIndex } from '@omne-harness/media-contract/testing'
import { CONFIG, T1, fakeImage } from './world.ts'

it('exports the factory of the core', async () => {
  const entry = (await import('@omne-harness/media')) as Record<string, unknown>
  expect(Object.keys(entry)).toEqual(['createMedia'])
})

it('answers unavailable while the store new objects go to is not there', async () => {
  const media = createMedia({
    stores: [createMemoryByteStore()],
    writeTo: 'elsewhere',
    index: createMemoryMediaIndex(),
    image: fakeImage().codec,
    clock: { now: () => '2026-10-19T00:00:00.000Z' },
    newKey: () => '0'.repeat(32),
    config: CONFIG,
  })
  const begun = await media.uploads.begin({
    tenant: T1,
    upload: 'upload-0001',
    mediaType: 'image/png',
    bytes: 16,
  })
  expect(begun).toEqual({ failure: { kind: 'unavailable', dependency: 'store' } })
})
