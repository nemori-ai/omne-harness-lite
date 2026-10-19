import { expect, it } from 'vitest'

it('the root entry exports the local custodian factories and nothing else at runtime', async () => {
  const root = await import('@omne-harness/model-host-local')
  expect(Object.keys(root).sort()).toEqual(['createLocalCustodian', 'openLocalCustodian'])
})
