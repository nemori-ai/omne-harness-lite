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

it('the index suite fails an index that lets a second record of a definition replace the first', async () => {
  const forgetful = async () => {
    const index = createMemoryMediaIndex()
    const last = new Map<string, unknown>()
    return {
      ...index,
      async recordRepresentation(input: Parameters<typeof index.recordRepresentation>[0]) {
        const answer = await index.recordRepresentation(input)
        if ('ok' in answer) last.set(input.key, input.representation)
        return 'ok' in answer ? { ok: input.representation } : answer
      },
      async readRepresentation(input: Parameters<typeof index.readRepresentation>[0]) {
        const answer = await index.readRepresentation(input)
        const kept = last.get(input.key)
        return 'ok' in answer && answer.ok !== null && kept !== undefined
          ? { ok: kept as never }
          : answer
      },
    }
  }
  const outcomes = await Promise.allSettled(
    mediaIndexConformanceCases.map(item => item.run(forgetful)),
  )
  expect(outcomes.filter(outcome => outcome.status === 'rejected')).toHaveLength(1)
})
