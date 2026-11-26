import { expect, it } from 'vitest'

it('the cordis entry exports the entry of a row and the step that swaps its generation', async () => {
  const cordis = (await import('@omne-harness/assembly-cordis/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis).sort()).toEqual(['EntryRefused', 'defineEntry', 'swapRow'])
})
