// The trust suite of request-context-cordis-contract, run on the real source registry.
import { describe, it } from 'vitest'
import { createContextSourceRegistry } from '@omne-harness/request-context'
import { tenantCodec } from '@omne-harness/legal-identity'
import { requestContextTrustConformance } from '@omne-harness/request-context-cordis-contract/testing'

function tenantOf(account: string) {
  const parsed = tenantCodec.parse(
    `{"organization":"org_00000000000000000000000000","account":"acc_${account.padStart(26, '0')}"}`,
  )
  if (!parsed.ok) throw new Error('Tenant fixture')
  return parsed.value
}

describe('trust conformance on the source registry', () => {
  for (const test of requestContextTrustConformance<string>({
    tenants: [tenantOf('0'), tenantOf('1')],
    createRegistry: input =>
      createContextSourceRegistry<string>({ ...input.trust, policies: input.policies }),
  }))
    it(`${test.name} (${test.clause})`, test.run)
})
