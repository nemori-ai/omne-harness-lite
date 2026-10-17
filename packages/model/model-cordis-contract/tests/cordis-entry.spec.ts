import { expect, it } from 'vitest'

it('the cordis entry exports the credential service definition and its key, nothing else yet', async () => {
  const cordis = (await import('@omne-harness/model-cordis-contract/cordis')) as Record<
    string,
    unknown
  >
  expect(Object.keys(cordis).sort()).toEqual(['ModelCredentialService', 'modelCredentialKey'])
  expect(cordis['modelCredentialKey']).toBe('modelCredential')
})
