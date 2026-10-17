import { expect, it } from 'vitest'

it('the public entry exports credential resolution and not the store schema', async () => {
  const root = await import('@omne-harness/model')
  expect(Object.keys(root).sort()).toEqual(
    ['MODEL_SEND', 'createLocalCustodian', 'credentialId', 'deliver', 'openLocalCustodian'].sort(),
  )
})
