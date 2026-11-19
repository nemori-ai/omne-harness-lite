import { expect, it } from 'vitest'

it('exports the factory of the index and nothing of how it stores', async () => {
  const root = (await import('@omne-harness/session-search-sqlite')) as Record<string, unknown>
  expect(Object.keys(root)).toEqual(['createSqliteHistoryIndex'])
})
