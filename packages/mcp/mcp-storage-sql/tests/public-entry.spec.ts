import { expect, it } from 'vitest'

it('the public entry exports the store, its materials and the name of its participant', async () => {
  const root = (await import('@omne-harness/mcp-storage-sql')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'createSqlCatalogStore',
    'createSqlContinuationRecords',
    'createSqlTaskRecords',
    'mcpSqlMaterials',
    'mcpStoreParticipant',
  ])
})
