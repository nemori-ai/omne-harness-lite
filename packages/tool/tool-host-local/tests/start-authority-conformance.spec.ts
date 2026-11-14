import { describe, expect, it } from 'vitest'
import { createMemoryToolLedgerStore } from '@omne-harness/tool/testing'
import {
  runConformanceCase,
  toolStartAuthorityConformance,
  type ToolStartAuthorityFixture,
} from '@omne-harness/tool-contract/testing'
import {
  coordinator,
  principalA,
  principalB,
  tenantA,
  tenantB,
  type Principal,
} from './coordinator-values.ts'

const NOT_APPLICABLE: Readonly<Record<string, string>> = {}

function fixture(): ToolStartAuthorityFixture<Principal> {
  return {
    authority: coordinator(createMemoryToolLedgerStore()),
    access: { principal: principalA, tenant: tenantA as never },
    otherAccess: { principal: principalB, tenant: tenantB as never },
  }
}

describe('G5 conformance: the local start coordinator against the ToolStartAuthority suite', () => {
  const cases = toolStartAuthorityConformance<Principal>()

  it('runs every case of the suite', () => {
    expect(cases.length).toBeGreaterThan(0)
  })

  it.each(cases)('$clause $name', async conformance => {
    const verdict = await runConformanceCase(conformance, fixture())
    const missing = NOT_APPLICABLE[conformance.name]
    expect(verdict).toEqual(
      missing === undefined ? { kind: 'passed' } : { kind: 'not-applicable', handle: missing },
    )
  })
})
