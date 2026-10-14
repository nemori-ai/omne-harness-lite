import { expect, it } from 'vitest'

it('exports the close protocol factory and lease id', async () => {
  const root = (await import('@omne-harness/assembly')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual(['LeaseId', 'createCloseProtocol'])
})
