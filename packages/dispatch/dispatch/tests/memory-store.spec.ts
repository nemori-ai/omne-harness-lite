import { describe, expect, it } from 'vitest'
import { createMemoryDispatchStore, storeConformanceCases } from '@omne-harness/dispatch/testing'

describe('the memory store conforms to the repository contract', () => {
  it.each(storeConformanceCases)('$name', async conformance => {
    await expect(conformance.run(async () => createMemoryDispatchStore())).resolves.toBeUndefined()
  })
})
