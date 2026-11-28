import { describe, expect, it } from 'vitest'
import {
  createMemoryEventRecords,
  mcpEventRecordsConformance,
  runConformanceCase,
} from '@omne-harness/mcp-contract/testing'
import {
  accountCodec,
  organizationCodec,
  tenant,
  type TenantId,
} from '@omne-harness/legal-identity'

function tenantOf(last: string): TenantId {
  const organization = organizationCodec.parse(`org_0123456789abcdefghjkmnpqr${last}`)
  const account = accountCodec.parse(`acc_0123456789abcdefghjkmnpqr${last}`)
  if (!organization.ok || !account.ok) throw new Error('bad tenant')
  return tenant(organization.value, account.value)
}

describe('the memory event records conform to their contract (MC-36, C302, C307)', () => {
  for (const conformance of mcpEventRecordsConformance()) {
    it(`${conformance.clause} ${conformance.name}`, async () => {
      const verdict = await runConformanceCase(conformance, {
        records: createMemoryEventRecords(),
        tenant: tenantOf('s'),
        otherTenant: tenantOf('t'),
      })
      expect(verdict).toEqual({ kind: 'passed' })
    })
  }
})
