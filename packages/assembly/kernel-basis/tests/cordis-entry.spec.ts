import { expect, it } from 'vitest'

it('draft cordis entry exports nothing until the accepted binding replaces it', async () => {
  const cordis = (await import('@omne-harness/kernel-basis/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis)).toEqual([])
})
