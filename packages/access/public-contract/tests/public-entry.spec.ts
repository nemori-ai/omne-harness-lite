import { expect, it } from 'vitest'

it('exports only the governance and session protocol codecs', async () => {
  const root = await import('@omne-harness/public-contract')
  expect(Object.keys(root).sort()).toEqual([
    'encodeGovernanceRequest',
    'encodeGovernanceResponse',
    'encodeSessionRequest',
    'encodeSessionResponse',
    'readGovernanceRequest',
    'readGovernanceResponse',
    'readSessionRequest',
    'readSessionResponse',
  ])
})
