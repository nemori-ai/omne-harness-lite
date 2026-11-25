import { expect, it } from 'vitest'

it('the root entry gives the SQL store, its materials and the policy, without Cordis', async () => {
  const root = (await import('@omne-harness/canvas-local')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'CanvasPolicyError',
    'canvasPersistenceParticipant',
    'canvasPolicySchema',
    'canvasSqlMaterials',
    'createSqlCanvasStore',
  ])
})
