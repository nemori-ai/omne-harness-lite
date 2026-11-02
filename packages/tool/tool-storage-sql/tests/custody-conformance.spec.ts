// The ToolOutputCustody suite of `@omne-harness/tool-contract/testing` (P05, P01) against the SQL
// custody over the SQLite test provider. The handles come from the SQL storage below the adapter:
//   readBytes       reads the chunks of the raw output back through the chunk read handler
//   failNext        the next commit (the first chunk) is rejected before acceptance (`queue_full`)
//   dropNextAnswer  the manifest commit runs and its answer is lost (`unknown`)
//   settle          resolves at once: the test provider lands every commit before it answers
//   otherAccess     a second registered tenant with a principal of its own
// No case may be not applicable; a case that became so fails the table below.
import { afterEach, describe, expect, it } from 'vitest'
import {
  runConformanceCase,
  toolOutputCustodyConformance,
  type ToolOutputCustodyFixture,
} from '@omne-harness/tool-contract/testing'
import { createSqlToolOutputCustody } from '../src/index.ts'
import { openApp, SUITE_TENANTS, type App } from './fixtures/app.ts'
import { readRawBytes } from './fixtures/custody.ts'

const NOT_APPLICABLE: Readonly<Record<string, string>> = {}

const opened: App[] = []

afterEach(() => {
  for (const app of opened.splice(0)) app.close()
})

async function fixture(): Promise<ToolOutputCustodyFixture<string>> {
  const app = await openApp()
  opened.push(app)
  const [own, other] = [SUITE_TENANTS[4], SUITE_TENANTS[5]]
  if (own === undefined || other === undefined) throw new Error('the suite tenants are missing')
  return {
    custody: createSqlToolOutputCustody<string>(app.custodyOptions()),
    access: { principal: 'tester', tenant: own },
    otherAccess: { principal: 'tester-other', tenant: other },
    readBytes: raw => readRawBytes(app, own, raw),
    failNext: () => app.faults.armCommit('rejected'),
    dropNextAnswer: () => app.faults.armCommit('unknown-applied', 'manifest'),
    settle: () => Promise.resolve(),
  }
}

describe('P05 custody suite on the SQL custody', () => {
  const cases = toolOutputCustodyConformance<string>()

  it('has cases', () => {
    expect(cases.length).toBeGreaterThan(0)
  })

  it.each(cases)('$clause $name', async conformance => {
    const verdict = await runConformanceCase(conformance, await fixture())
    const missing = NOT_APPLICABLE[conformance.name]
    expect(verdict).toEqual(
      missing === undefined ? { kind: 'passed' } : { kind: 'not-applicable', handle: missing },
    )
  })
})
