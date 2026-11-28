import { expect, it } from 'vitest'

it('the root entry exports the credential port over the secret custody, the send path, the official profiles and their catalog, the owner of looked-up costs and nothing else at runtime', async () => {
  const root = await import('@omne-harness/model-host-local')
  expect(Object.keys(root).sort()).toEqual([
    'COST_LOOKUP_OWNER',
    'SendResourceDefect',
    'assembleLocalModel',
    'createDecisionPreparation',
    'createLivePreparation',
    'createPiSendResources',
    'createSecretCredentialPort',
    'officialCatalog',
    'officialProfileAdoption',
    'officialProfiles',
    'officialSupplierProviders',
  ])
})
