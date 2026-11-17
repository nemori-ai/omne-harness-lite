import { expect, it } from 'vitest'

it('the root entry exports only the contribution factory', async () => {
  const root = (await import('@omne-harness/tool-access')) as Record<string, unknown>
  expect(Object.keys(root)).toEqual(['createToolAccessContribution'])
})
