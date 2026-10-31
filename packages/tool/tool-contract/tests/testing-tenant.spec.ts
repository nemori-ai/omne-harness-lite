import { describe, expect, it } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import { testingTenant } from '@omne-harness/tool-contract/testing'

const organization = `org_${'0'.repeat(26)}`
const account = `acc_${'1'.repeat(26)}`

describe('testingTenant', () => {
  it('mints a tenant that the public tenant codec can encode', () => {
    const value = testingTenant(organization, account)
    expect(tenantCodec.encode(value)).toEqual({
      ok: true,
      value: JSON.stringify({ organization, account }),
    })
  })

  it.each([
    ['organization', 'invalid-org', account],
    ['account', organization, 'invalid-account'],
  ])('rejects an illegal %s text', (_, org, acc) => {
    expect(() => testingTenant(org, acc)).toThrow('illegal test tenant text')
  })
})
