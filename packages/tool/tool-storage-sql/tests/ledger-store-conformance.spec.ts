// The two ledger store suites of `@omne-harness/tool/testing` (G1, P01) against the SQL ledger
// store over the SQLite test provider. Each of the seven fault handles is armed on the SQL storage
// below the adapter, so a case observes the adapter's answer to a real storage answer:
//   readUnavailable    the next read answers `unavailable` (`queue_timeout`, sql-contract §9.2)
//   commitUnavailable  the next commit is rejected before acceptance (`queue_full`, §7.2 step 8)
//   unknownApplied     the commit runs and its answer is lost (`unknown`, §7.7.2 last rows)
//   unknownDropped     the commit never runs and the answer is `unknown` (§7.1 withdrawn)
//   throwApplied       the provider throws after the commit ran, breaking §2.5
//   delayed            the commit is held in admission and sent at `land` (§7.1 observer detached)
//   rejectedHostValue  a function host value: not strict JSON, refused before any commit
// No case may be not applicable; a case that became so fails the table below.
import { afterEach, describe, expect, it } from 'vitest'
import {
  toolLedgerStoreCompositionConformance,
  toolLedgerStoreConformance,
  type ToolLedgerStoreFixture,
} from '@omne-harness/tool/testing'
import { runConformanceCase } from '@omne-harness/tool-contract/testing'
import { openApp, type App } from './fixtures/app.ts'

/** The cases that this store cannot run, with the handle each one misses. */
const NOT_APPLICABLE: Readonly<Record<string, string>> = {}

const opened: App[] = []

afterEach(() => {
  for (const app of opened.splice(0)) app.close()
})

async function fixture(): Promise<ToolLedgerStoreFixture> {
  const app = await openApp()
  opened.push(app)
  const { faults } = app
  return {
    store: app.store,
    controls: {
      readUnavailable: () => faults.failNextRead(),
      commitUnavailable: () => faults.armCommit('rejected'),
      unknownApplied: () => faults.armCommit('unknown-applied'),
      unknownDropped: () => faults.armCommit('unknown-dropped'),
      throwApplied: () => faults.armCommit('throw-applied'),
      delayed: { arm: () => faults.armCommit('delayed'), land: () => faults.land() },
      rejectedHostValue: () => () => undefined,
    },
    close: () => {},
  }
}

describe.each([
  ['G1 store', toolLedgerStoreConformance()],
  ['P01 composition', toolLedgerStoreCompositionConformance()],
])('%s suite on the SQL ledger store', (_, cases) => {
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

it('the store declares itself durable: a production assembly may use it', async () => {
  const app = await openApp()
  opened.push(app)
  expect(app.store.durability).toBe('durable')
})
