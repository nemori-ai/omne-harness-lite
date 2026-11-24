import { describe, expect, it } from 'vitest'
import { createMemoryStore, storeConformanceCases } from '@omne-harness/canvas/testing'

describe('the memory store conforms to the store contract', () => {
  it.each(storeConformanceCases)('$name', async conformance => {
    await expect(conformance.run(async () => createMemoryStore())).resolves.toBeUndefined()
  })
})
