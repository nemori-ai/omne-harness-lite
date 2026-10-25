import { expect, it } from 'vitest'

it('the conformance entry exports the obligation suite and none of the scripted doubles', async () => {
  const conformance = await import('@omne-harness/model-contract/conformance')
  expect(Object.keys(conformance).sort()).toEqual([
    'CONFORMANCE_OBLIGATIONS',
    'checkModelProviderConformance',
  ])
})
