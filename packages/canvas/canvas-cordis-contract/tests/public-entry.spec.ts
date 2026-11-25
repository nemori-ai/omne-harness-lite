import { expect, it } from 'vitest'

it('the root entry gives nothing at run time: the service and the point are on ./cordis', async () => {
  expect(Object.keys(await import('@omne-harness/canvas-cordis-contract'))).toEqual([])
})
