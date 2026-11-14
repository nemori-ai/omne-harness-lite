import { describe, expect, it } from 'vitest'
import { memoryAccess } from '@omne-harness/session-contract/testing'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { TenantDomainListing, TenantDomains } from '@omne-harness/sql-contract'
import { deployedTenants } from '../../../src/rows/session-provider/real.ts'

const SCANNER = { kind: 'system', component: 'scanner' }
const tenant = memoryAccess('tester', 'deployed').tenant
const text = (() => {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new Error('unminted tenant')
  return encoded.value
})()
const domain = { scope: { kind: 'tenant' as const, tenant: text }, transactionDomain: 'dom_0' }

function directory(listing: TenantDomainListing) {
  const asked: unknown[] = []
  const domains: TenantDomains<unknown> = {
    enumerate: ({ principal }) => {
      asked.push(principal)
      return Promise.resolve(listing)
    },
  }
  return { domains, asked }
}

describe('session-provider row: the tenants of the deployment', () => {
  it('asks the directory as the scanner and answers the tenant of each entry', async () => {
    const { domains, asked } = directory({
      kind: 'ready',
      revision: '1',
      entries: [{ tenant: text, domain }],
    })
    expect(await deployedTenants(domains, SCANNER)()).toEqual({ ok: [tenant] })
    expect(asked).toEqual([SCANNER])
  })

  it('a directory with no tenant answers an empty list', async () => {
    const { domains } = directory({ kind: 'ready', revision: '0', entries: [] })
    expect(await deployedTenants(domains, SCANNER)()).toEqual({ ok: [] })
  })

  it('a refusal and an unavailable directory are failures of their kind', async () => {
    expect(await deployedTenants(directory({ kind: 'denied' }).domains, SCANNER)()).toEqual({
      failure: { kind: 'denied', diagnostic: 'the scanner may not enumerate tenants' },
    })
    expect(
      await deployedTenants(
        directory({ kind: 'unavailable', diagnostic: 'closed' }).domains,
        SCANNER,
      )(),
    ).toEqual({ failure: { kind: 'unavailable', diagnostic: 'closed' } })
  })

  it('an entry whose text names no tenant fails the whole answer', async () => {
    const { domains } = directory({
      kind: 'ready',
      revision: '1',
      entries: [
        { tenant: text, domain },
        { tenant: 'not a tenant', domain },
      ],
    })
    expect(await deployedTenants(domains, SCANNER)()).toEqual({
      failure: { kind: 'unavailable', diagnostic: 'a directory entry names no tenant' },
    })
  })
})
