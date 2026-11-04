// @module-tag slow
// Two bounds of the login checks in the governance commands and reads, on the real SQLite provider,
// each with its negative control on a copy of `dist` (`fixtures/mutants.ts`):
// - IS-12: a revocation of a target that has ended and was never revoked answers `no-change` and
//   writes no revocation row. Without the deadline check the copy writes a row.
// - IS-10, IS-11: a reading earlier than the issue time of the initiating login is no basis, as in
//   recognition (IS-05 step 5): every governance call answers `basis-unavailable` and writes nothing.
//   Without the lower bound the copy judges the login on its deadlines only and goes on.
// Slow: each case opens storage deployments with their Worker threads; the second one restarts the
// provider twice on the same files.
import { DatabaseSync } from 'node:sqlite'
import { rm } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { manualIdentityClock } from '@omne-harness/identity/testing'
import { REAL_BUILD, type IdentitySqlBuild } from './fixtures/governance.ts'
import { CHECKS, mutantBuild, type Mutation } from './fixtures/mutants.ts'
import { duration, instant, openProvider, START } from './fixtures/provider.ts'
import { identityDomainFile, openSqliteStorage } from './fixtures/storage.ts'

const CREDENTIALS = { loginIdentifier: 'bounds-ada', credential: 'credential-ada' }

/** Runs `observe` on the real build, or on a copy with `mutations`, and removes the copy. */
async function onBuild<T>(
  mutations: readonly Mutation[] | undefined,
  observe: (build: IdentitySqlBuild) => Promise<T>,
): Promise<T> {
  if (mutations === undefined) return observe(REAL_BUILD)
  const mutant = await mutantBuild('bounds', mutations)
  try {
    return await observe(mutant.build)
  } finally {
    mutant.remove()
  }
}

/**
 * Ada has login `ended`, issued at START, and login `caller`, issued 40 minutes later. At START
 * plus 70 minutes `ended` is past its idle deadline (one hour) and `caller` is valid. `caller`
 * revokes `ended`. Returns the outcome and the number of revocation rows in the domain file.
 */
async function revokeEndedTarget(build: IdentitySqlBuild) {
  const storage = await openSqliteStorage(undefined, build.identitySqlMaterials())
  let open = true
  try {
    const opened = await openProvider({ build, storage })
    const { operations, governance } = opened.provider
    if ((await operations.registerAndActivate(CREDENTIALS)).kind !== 'succeeded')
      throw new Error('registration failed')
    const ended = await operations.issueLogin(CREDENTIALS)
    opened.clock.advanceBy(duration('PT2400S'))
    const caller = await operations.issueLogin(CREDENTIALS)
    if (ended.kind !== 'succeeded' || caller.kind !== 'succeeded') throw new Error('issue failed')
    opened.clock.advanceBy(duration('PT1800S'))
    const before = await operations.recognizeLogin({ loginProof: ended.loginProof })
    const revoked = await governance.revokeLogin({ login: caller.login, target: ended.login })
    await opened.close()
    // Close the storage first, so the domain file is complete.
    open = false
    await storage.close()
    const db = new DatabaseSync(identityDomainFile(storage.storageRoot), { readOnly: true })
    try {
      const row = db.prepare('SELECT count(*) AS n FROM id_login_revocation').get() as {
        n: number
      }
      return { before: before.kind, revoked: revoked.kind, revocationRows: Number(row.n) }
    } finally {
      db.close()
    }
  } finally {
    if (open) await storage.close()
    await rm(storage.base, { recursive: true, force: true })
  }
}

/**
 * Ada's login is issued at START plus one hour. A second provider instance on the same files reads
 * START: every governance call of that login and its recognition answer `basis-unavailable`. A
 * third instance reads START plus 90 minutes: the login is still valid and still Ada's personal
 * selection, so the early calls wrote nothing.
 */
async function governAtEarlyReading(build: IdentitySqlBuild) {
  const storage = await openSqliteStorage(undefined, build.identitySqlMaterials())
  const answer = (outcome: Readonly<{ kind: string; diagnostic?: string }>) =>
    outcome.kind === 'basis-unavailable'
      ? `${outcome.kind}:${String(outcome.diagnostic)}`
      : outcome.kind
  try {
    const first = await openProvider({ build, storage })
    const registered = await first.provider.operations.registerAndActivate(CREDENTIALS)
    if (registered.kind !== 'succeeded') throw new Error('registration failed')
    first.clock.advanceBy(duration('PT3600S'))
    const issued = await first.provider.operations.issueLogin(CREDENTIALS)
    if (issued.kind !== 'succeeded') throw new Error('issue failed')
    await first.close()

    const early = await openProvider({
      build,
      storage,
      clock: manualIdentityClock(instant(START)).clock,
    })
    const { operations, governance } = early.provider
    const login = issued.login
    const acting = { login, actingTenant: registered.tenant }
    const observed = {
      recognize: answer(await operations.recognizeLogin({ loginProof: issued.loginProof })),
      currentTenant: answer(await governance.queryCurrentTenant({ login })),
      validLogins: answer(await governance.queryOwnValidLogins({ login })),
      memberships: answer(await governance.queryOwnMemberships({ login })),
      report: answer(await governance.reportBusinessAccess({ login })),
      switchTenant: answer(
        await governance.switchCurrentTenant({ ...acting, tenant: registered.tenant }),
      ),
      create: answer(
        await governance.createOrganization({
          ...acting,
          createCallId: 'early-create',
          name: 'Early team',
          governanceModelId: 'default-team',
        }),
      ),
      revoke: answer(await governance.revokeLogin({ login, target: login })),
    }
    await early.close()

    const late = await openProvider({
      build,
      storage,
      clock: manualIdentityClock(instant('2026-10-25T13:30:00Z')).clock,
    })
    const after = await late.provider.operations.recognizeLogin({ loginProof: issued.loginProof })
    const created = await late.provider.governance.queryCreateOrganization({
      login,
      createCallId: 'early-create',
      name: 'Early team',
      governanceModelId: 'default-team',
    })
    await late.close()
    return { ...observed, after: after.kind, createdAfter: answer(created) }
  } finally {
    await storage.close({ remove: true })
  }
}

const EARLY = 'basis-unavailable:clock-earlier-than-record'

describe('the login bounds of governance on the SQL provider', () => {
  it(
    'answers no-change to a revocation of an ended target that was never revoked, and writes no row',
    { tags: ['slow'], timeout: 120_000 },
    async () => {
      expect(await onBuild(undefined, revokeEndedTarget)).toEqual({
        before: 'invalid',
        revoked: 'no-change',
        revocationRows: 0,
      })
    },
  )

  it(
    'negative control: when only a revocation row ends a target, the ended target gets a row',
    { tags: ['slow'], timeout: 120_000 },
    async () => {
      const observed = await onBuild([CHECKS['ended-target-no-change']], revokeEndedTarget)
      expect(observed).toEqual({ before: 'invalid', revoked: 'succeeded', revocationRows: 1 })
    },
  )

  it(
    'answers basis-unavailable to every governance call at a reading earlier than the issue time',
    { tags: ['slow'], timeout: 180_000 },
    async () => {
      expect(await onBuild(undefined, governAtEarlyReading)).toEqual({
        recognize: EARLY,
        currentTenant: EARLY,
        validLogins: EARLY,
        memberships: EARLY,
        report: EARLY,
        switchTenant: EARLY,
        create: EARLY,
        revoke: EARLY,
        after: 'recognized',
        createdAfter: 'unknown',
      })
    },
  )

  it(
    'negative control: without the issue time as the lower bound, governance goes on at that reading',
    { tags: ['slow'], timeout: 180_000 },
    async () => {
      const observed = await onBuild([CHECKS['issued-at-floor']], governAtEarlyReading)
      // Recognition keeps its own bound in the main thread; the governance checks lost theirs.
      expect(observed.recognize).toBe(EARLY)
      expect(observed.currentTenant).toBe('succeeded')
      expect(observed.revoke).toBe('succeeded')
      expect(observed.after).toBe('invalid')
    },
  )
})
