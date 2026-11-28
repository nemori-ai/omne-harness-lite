import { describe, expect, it } from 'vitest'
import {
  createMemoryEventConsumer,
  mcpEventConsumerConformance,
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

describe('the memory consumer conforms to the consumer port (C306)', () => {
  for (const conformance of mcpEventConsumerConformance())
    it(`${conformance.clause} ${conformance.name}`, async () => {
      const consumer = createMemoryEventConsumer()
      const verdict = await runConformanceCase(conformance, {
        consumer,
        tenant: tenantOf('s'),
        kept: ref => consumer.kept(ref),
      })
      expect(verdict).toEqual({ kind: 'passed' })
    })
})
