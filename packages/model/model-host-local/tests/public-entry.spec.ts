import { expect, it } from 'vitest'

it('the root entry exports the custodian factories, the Model binding keys, the send path and nothing else at runtime', async () => {
  const root = await import('@omne-harness/model-host-local')
  expect(Object.keys(root).sort()).toEqual([
    'MODEL_FACTORY_SECRET_KEY',
    'MODEL_SECRET_OWNER',
    'SendResourceDefect',
    'assembleLocalModel',
    'createLocalCustodian',
    'createPiSendResources',
    'modelCredentialBindingKey',
    'openLocalCustodian',
  ])
})
