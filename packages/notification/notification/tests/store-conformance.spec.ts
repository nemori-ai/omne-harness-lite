import { describe, it } from 'vitest'
import { createMemoryStore, storeConformanceCases } from '@omne-harness/notification/testing'

describe('the memory store conforms to the repository contract', () => {
  for (const conformance of storeConformanceCases)
    it(conformance.name, () => conformance.run(async () => createMemoryStore()))
})
