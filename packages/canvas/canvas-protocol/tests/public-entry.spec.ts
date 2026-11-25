import { expect, it } from 'vitest'

it('the root entry gives the protocol and nothing else at run time', async () => {
  const root = (await import('@omne-harness/canvas-protocol')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual(['canvasProtocol'])
})
