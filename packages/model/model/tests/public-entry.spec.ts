import { expect, it } from 'vitest'

it('the public entry exports credential delivery and not the store schema or the contract values', async () => {
  const root = await import('@omne-harness/model')
  expect(Object.keys(root).sort()).toEqual(
    ['createLocalCustodian', 'deliver', 'openLocalCustodian'].sort(),
  )
})

it('the cordis entry exports the local plugin only, not the service definition it extends', async () => {
  const cordis = await import('@omne-harness/model/cordis')
  expect(Object.keys(cordis)).toEqual(['LocalCredentialPlugin'])
})
