import { expect, it } from 'vitest'

it('the root entry gives the back of the canvas and its reads, without Cordis', async () => {
  const root = (await import('@omne-harness/canvas-ui')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual(['CanvasBack', 'readKinds', 'readLook'])
})
