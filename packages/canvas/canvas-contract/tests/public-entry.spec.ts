import { expect, it } from 'vitest'

it('the root entry gives the schemas of the values, the canvas own kind and the reading of a look', async () => {
  const root = (await import('@omne-harness/canvas-contract')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'CANVAS_APP',
    'MAIN_CANVAS',
    'canvasAppKind',
    'canvasIdSchema',
    'instantSchema',
    'itemIdSchema',
    'itemSchema',
    'kindNameSchema',
    'lookRequestSchema',
    'moverSchema',
    'parseLook',
    'pileIdSchema',
    'pileSchema',
    'referenceSchema',
    'sheetSchema',
    'sizeSchema',
    'spotSchema',
    'tenantIdSchema',
  ])
})
