import { expect, it } from 'vitest'

it('exports only the four shared protocol codecs', async () => {
  const root = await import('@omne-harness/public-contract')
  expect(Object.keys(root).sort()).toEqual([
    'encodeGovernanceRequest',
    'encodeGovernanceResponse',
    'readGovernanceRequest',
    'readGovernanceResponse',
  ])
})
