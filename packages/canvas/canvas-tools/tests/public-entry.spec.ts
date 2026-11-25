import { expect, it } from 'vitest'

it('the root entry gives the tool module, its binding and its declaration, and nothing else', async () => {
  const root = (await import('@omne-harness/canvas-tools')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'answerCanvas',
    'attachCanvas',
    'bindCanvas',
    'canvasAdoption',
    'canvasCommandNames',
    'canvasContract',
    'canvasExecutor',
    'canvasOf',
    'canvasParameterCodec',
    'canvasToolModule',
    'createCanvasAuthor',
  ])
})
