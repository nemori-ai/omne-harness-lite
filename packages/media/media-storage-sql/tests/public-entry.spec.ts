import { expect, it } from 'vitest'

it('the public entry exports the index, its materials and the name of its participant', async () => {
  const root = (await import('@omne-harness/media-storage-sql')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'createSqlMediaIndex',
    'mediaIndexParticipant',
    'mediaSqlMaterials',
  ])
})
