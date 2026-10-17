import { expect, it } from 'vitest'

it('the public entry exports credential delivery and not the store schema or the contract values', async () => {
  const root = await import('@omne-harness/model')
  expect(Object.keys(root).sort()).toEqual(
    ['createLocalCustodian', 'deliver', 'openLocalCustodian'].sort(),
  )
})
