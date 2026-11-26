import { expect, it } from 'vitest'

it('the root entry exports the attribution of falls and nothing of Cordis', async () => {
  const root = (await import('@omne-harness/assembly-cordis')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual(['attributed', 'attributedNow', 'watchFalls'])
})
