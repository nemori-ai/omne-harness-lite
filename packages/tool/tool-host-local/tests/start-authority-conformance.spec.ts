// The ToolStartAuthority conformance suite of the contract package (P04, story 24), run against the
// local start coordinator (G5) over a non-durable ledger store. The suite needs no control handle,
// so no case may be not applicable; a case that became so would fail the table below.
import type { ContentBlock } from '@omne-harness/content-block'
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

/** The cases that the coordinator cannot run, with the handle each one misses. */
const NOT_APPLICABLE: Readonly<Record<string, string>> = {}

function fixture(): ToolStartAuthorityFixture<Principal> {
  return {
    authority: coordinator(createMemoryToolLedgerStore<ContentBlock>()),
    // The tests pass the TenantShape that the coordinator reads where the contract types TenantId.
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
