import { expect, it } from 'vitest'

it('the root entry exports the custodian factories, the send path and nothing else at runtime', async () => {
  const root = await import('@omne-harness/model-host-local')
  expect(Object.keys(root).sort()).toEqual([
    'SendResourceDefect',
    'createLocalCustodian',
    'createPiSendResources',
    'openLocalCustodian',
  ])
})
