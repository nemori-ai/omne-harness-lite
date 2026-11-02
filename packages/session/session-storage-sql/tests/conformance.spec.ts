// The transaction and commitEntries conformance suites of session-contract, run on the real
// participant and read handlers over the SQLite test provider. Every case runs and none is pinned
// as a known failure. The same commitEntries suite runs on the real sqlite-provider in
// real-provider.spec.ts.
import { describe, it } from 'vitest'
import {
  adoptedInitializationFixture,
  creation,
  initializationFixtureFacts,
  initializationFixtureGuard,
  operationId,
  sessionEntriesConformance,
  sessionTransactionsConformance,
  type SessionTransactionsFixture,
} from '@omne-harness/session-contract/testing'
import { app, TENANT_A, TENANT_B } from './fixtures/app.ts'

async function fixture(): Promise<SessionTransactionsFixture<string>> {
  const a = await app()
  return {
    port: a.port,
    access: a.access(TENANT_A),
    otherAccess: a.access(TENANT_B),
    creation: creation(),
    operation: name => operationId(name),
    initializationGuards: command =>
      Promise.resolve([
        initializationFixtureGuard(
          initializationFixtureFacts(command, null, adoptedInitializationFixture(command)),
        ),
      ]),
    askedAccessChecks: () => a.accessCheck.controls.asked().length,
  }
}

describe('session-contract transaction conformance on the SQL storage', () => {
  const cases = sessionTransactionsConformance<string>()
  const label = (test: (typeof cases)[number]): string => `${test.clause}: ${test.name}`

  for (const test of cases)
    it(label(test), async () => {
      await test.run(await fixture())
    })
})

describe('session-contract commitEntries conformance on the SQL storage', () => {
  for (const test of sessionEntriesConformance<string>())
    it(`${test.clause}: ${test.name}`, async () => {
      await test.run(await fixture())
    })
})
