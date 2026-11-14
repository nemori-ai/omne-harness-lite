import { afterEach, describe, expect, it } from 'vitest'
import {
  toolLedgerStoreCompositionConformance,
  toolLedgerStoreConformance,
  type ToolLedgerStoreFixture,
} from '@omne-harness/tool/testing'
import { runConformanceCase } from '@omne-harness/tool-contract/testing'
import { openApp, type App } from './fixtures/app.ts'

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
