import { describe, expect, it } from 'vitest'
import {
  requestContextTrustConformance,
  type RequestContextTrustFixture,
} from '@omne-harness/request-context-cordis-contract/testing'
import { tenantCodec } from '@omne-harness/legal-identity'
import { createReferenceRegistry, DEFECTS, type Defect } from './trust-registry.js'

function tenantOf(account: string) {
  const parsed = tenantCodec.parse(
    `{"organization":"org_00000000000000000000000000","account":"acc_${account.padStart(26, '0')}"}`,
  )
  if (!parsed.ok) throw new Error('Tenant fixture')
  return parsed.value
}
function fixtureFor(defect?: Defect): RequestContextTrustFixture<string> {
  return {
    tenants: [tenantOf('0'), tenantOf('1')],
    createRegistry: input => createReferenceRegistry(input, defect),
  }
}
async function failures(defect?: Defect): Promise<string[]> {
  const failed: string[] = []
  for (const test of requestContextTrustConformance(fixtureFor(defect))) {
    try {
      await test.run()
    } catch {
      failed.push(test.name)
    }
  }
  return failed
}

// Each defect breaks exactly one rule, so exactly one case must go red (C7).
const EXPECTED_RED: Record<Defect, string> = {
  'cache-key-by-principal': 'cross-tenant-keys-stay-apart',
  'ignore-binding': 'forged-principal-is-not-keyed',
  'replace-cross-tenant': 'foreign-expected-is-not-replaceable',
  'owner-rewrite': 'owner-revision-takes-part',
  'unknown-as-allowed': 'authority-answers-are-returned',
  'self-grant': 'source-set-cannot-self-grant',
  'stale-decision': 'revoked-authority-refuses-replace',
  'withdraw-removes-successor': 'old-generation-keeps-successor',
  'register-after-close': 'closed-registry-refuses-registration',
}

describe('trust conformance against a reference registry', () => {
  it('has the nine cases, with distinct names and non-empty clauses', () => {
    const cases = requestContextTrustConformance(fixtureFor())
    expect(cases.map(c => c.name).sort()).toEqual(Object.values(EXPECTED_RED).sort())
    expect(cases.every(c => c.clause.length > 0)).toBe(true)
  })
  it('a registry that honours the rules passes every case', async () => {
    expect(await failures()).toEqual([])
  })
  it.each(DEFECTS)('defect %s turns exactly its own case red', async defect => {
    expect(await failures(defect)).toEqual([EXPECTED_RED[defect]])
  })
})
