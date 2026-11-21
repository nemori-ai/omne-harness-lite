import { expect, it } from 'vitest'
import {
  byteStoreConformanceCases,
  createMemoryByteStore,
  createMemoryMediaIndex,
  createMemoryMedium,
  mediaIndexConformanceCases,
  type StoreWorld,
} from '@omne-harness/media-contract/testing'

async function memoryWorld(): Promise<StoreWorld> {
  const medium = createMemoryMedium()
  return { store: createMemoryByteStore(medium), reopen: async () => createMemoryByteStore(medium) }
}

it.each(byteStoreConformanceCases)('memory store: $name', async item => {
  await expect(item.run(memoryWorld)).resolves.toBeUndefined()
})

it.each(mediaIndexConformanceCases)('memory index: $name', async item => {
  await expect(item.run(async () => createMemoryMediaIndex())).resolves.toBeUndefined()
})

it('the store suite fails a store that hands bytes out before their seal', async () => {
  const early = async (): Promise<StoreWorld> => {
    const medium = createMemoryMedium()
    const store = createMemoryByteStore(medium)
    const leaky = {
      ...store,
      async append(write: string, sequence: number, part: Uint8Array) {
        medium.sealed.set(write.slice('write:'.length), part)
        return store.append(write, sequence, part)
      },
    }
    return { store: leaky, reopen: async () => leaky }
  }
  const outcomes = await Promise.allSettled(byteStoreConformanceCases.map(item => item.run(early)))
  expect(outcomes.some(outcome => outcome.status === 'rejected')).toBe(true)
})

it('the index suite fails an index that merges across tenants', async () => {
  const careless = async () => {
    const index = createMemoryMediaIndex()
    return {
      ...index,
      stageOrMerge: (staging: Parameters<typeof index.stageOrMerge>[0]) =>
        index.stageOrMerge({ ...staging, digest: `${staging.digest}` }).then(async answer => {
          if ('failure' in answer && staging.tenant !== 'tenant-one')
            return index.stageOrMerge({ ...staging, tenant: 'tenant-one' })
          return answer
        }),
    }
  }
  const outcomes = await Promise.allSettled(
    mediaIndexConformanceCases.map(item => item.run(careless)),
  )
  expect(outcomes.some(outcome => outcome.status === 'rejected')).toBe(true)
})
