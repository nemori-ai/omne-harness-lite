import { describe, expect, it } from 'vitest'
import { createMemoryStore, storeConformanceCases } from '@omne-harness/notification/testing'

describe('the memory store conforms to the repository contract', () => {
  it.each(storeConformanceCases)('$name', async conformance => {
    await expect(conformance.run(async () => createMemoryStore())).resolves.toBeUndefined()
  })
})
