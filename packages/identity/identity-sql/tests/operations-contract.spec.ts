// @module-tag slow
import { afterAll, describe, expect, it } from 'vitest'
import {
  IDENTITY_CONTRACT_CASES,
  adjustableInvitationTerms,
  checkIdentityOperationsContract,
  type IdentityContractFixture,
  type IdentityContractOptions,
} from '@omne-harness/identity/testing'
import { createIdentitySql, identitySqlRegistration } from '@omne-harness/identity-sql'
import { withRecordFaults } from './fixtures/faults.ts'
import { duration, instant } from './fixtures/provider.ts'
import { openTestScrypt } from './fixtures/scrypt.ts'
import { openSqliteStorage, type OpenedStorage } from './fixtures/storage.ts'

const CONFIGURATIONS: readonly (readonly [string, IdentityContractOptions])[] = [
  [
    'one minute and one day',
    {
      start: instant('2026-10-25T23:59:30Z'),
      short: duration('PT60S'),
      long: duration('PT86400S'),
    },
  ],
  [
    'fractional lifetimes',
    {
      start: instant('2026-12-31T23:59:59.25Z'),
      short: duration('PT0.5S'),
      long: duration('PT2.125S'),
    },
  ],
]

const opened: { storage: OpenedStorage; stop(): Promise<void> }[] = []

afterAll(async () => {
  for (const entry of opened.splice(0)) {
    await entry.stop()
    await entry.storage.close({ remove: true })
  }
}, 120_000)

const fixture: IdentityContractFixture = {
  injectsRecordFaults: true,
  async create({ clock, terms, faults }) {
    const storage = await openSqliteStorage()
    const registered = await storage.storage.registerCombination(identitySqlRegistration())
    if (registered.kind !== 'registered') throw new Error(`registration ${registered.kind}`)
    const scrypt = await openTestScrypt()
    const provider = createIdentitySql({
      storage: withRecordFaults(storage.storage, faults),
      clock,
      terms,
      invitationTerms: adjustableInvitationTerms({
        defaultDuration: duration('PT60S'),
        maxDuration: duration('PT86400S'),
      }).source,
      scrypt: scrypt.module,
      accessRefreshGranularity: duration('PT60S'),
      decoyMaterial: scrypt.decoyMaterial,
    })
    opened.push({
      storage,
      async stop() {
        provider.stop()
        await scrypt.module.close()
      },
    })
    return provider.operations
  },
}

describe('the identity contract suite on the SQL provider', () => {
  it.each(CONFIGURATIONS)(
    'passes every applicable case with %s',
    { tags: ['slow'], timeout: 120_000 },
    async (_name, options) => {
      const report = await checkIdentityOperationsContract(fixture, options)
      const failed = report.cases.filter(result => result.status === 'failed')
      expect(failed).toEqual([])
      expect(report.passed).toBe(true)
      expect(report.cases.map(result => result.id)).toEqual(
        IDENTITY_CONTRACT_CASES.map(contractCase => contractCase.id),
      )
      expect(
        report.cases.filter(result => result.status === 'not-applicable').map(result => result.id),
      ).toEqual(['login-inactive-uniform'])
    },
  )
})
