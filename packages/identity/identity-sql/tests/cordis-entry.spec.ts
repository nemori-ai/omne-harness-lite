// The `./cordis` plugin on a real Context 4.0.4: it injects `storage` and `identityClock`, registers
// the identity combination, provides `identityOperations`, `tenantStanding` and
// `identityGovernance` as subclasses of the identity service definitions over one provider, fails
// the fiber on a bad configuration, stays PENDING without a clock, and stops the provider on
// disposal. The clock comes through the `identityClock` key (R1-D27), so the lifetimes are checked
// by moving a controlled clock, not by waiting. The end-to-end case runs the deployed
// SCRYPT_PROFILE, so it is slow.
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import type { SqlStorage } from '@omne-harness/sql-contract'
import { StorageService } from '@omne-harness/sql-contract/cordis'
import type { IdentityClock } from '@omne-harness/identity'
import {
  IdentityClockService,
  IdentityGovernanceService,
  IdentityOperationsService,
  TenantStandingSourceService,
  identityClockKey,
  identityGovernanceKey,
  identityOperationsKey,
  tenantStandingKey,
} from '@omne-harness/identity/cordis'
import { manualIdentityClock, type ManualIdentityClock } from '@omne-harness/identity/testing'
import { encodeInstant, parseDuration } from '@omne-harness/utc-instant'
import { IDENTITY_SQL_DEFAULT_CONFIG } from '@omne-harness/identity-sql'
import { IdentitySqlPlugin } from '@omne-harness/identity-sql/cordis'
import { START, duration, instant } from './fixtures/provider.ts'
import { openSqliteStorage, type OpenedStorage } from './fixtures/storage.ts'

const PENDING = 0
const FAILED = 3

const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

type Host = Readonly<{ ctx: Context; storage: OpenedStorage; clock: ManualIdentityClock }>

/** A root with a forwarding `storage` service and, unless withheld, a controlled `identityClock`. */
async function hostContext(options: Readonly<{ clock?: boolean }> = {}): Promise<Host> {
  const storage = await openSqliteStorage()
  cleanups.push(() => storage.close({ remove: true }))
  class TestStorage extends StorageService {
    readonly registerCombination: SqlStorage['registerCombination'] = input =>
      storage.storage.registerCombination(input)
    readonly commit: SqlStorage['commit'] = (input, options) =>
      storage.storage.commit(input, options)
    readonly query: SqlStorage['query'] = identity => storage.storage.query(identity)
    readonly read: SqlStorage['read'] = (input, options) => storage.storage.read(input, options)
  }
  const clock = manualIdentityClock(instant(START))
  class TestClock extends IdentityClockService {
    readonly now: IdentityClock['now'] = () => clock.clock.now()
  }
  const ctx = new Context()
  await ctx.plugin(TestStorage)
  if (options.clock !== false) await ctx.plugin(TestClock)
  return { ctx, storage, clock }
}

/** The idle period of the default configuration, plus one second. */
function pastIdlePeriod() {
  const idle = parseDuration(IDENTITY_SQL_DEFAULT_CONFIG.idlePeriod)
  if (!idle.ok) throw new Error('fixture: default idle period')
  return { idle: idle.value, second: duration('PT1S') }
}

describe('IdentitySqlPlugin', () => {
  it('injects storage and identityClock, nothing else', () => {
    expect(IdentitySqlPlugin.inject).toEqual(['storage', 'identityClock'])
  })

  it('fails the fiber on an illegal lifetime', async () => {
    const { ctx } = await hostContext()
    const fiber = ctx.plugin(IdentitySqlPlugin, { maxLifetime: 'PT0S', idlePeriod: 'PT1S' })
    await expect(fiber).rejects.toThrow()
    expect(fiber.state as number).toBe(FAILED)
    expect(ctx.get(identityOperationsKey)).toBeUndefined()
  })

  it('fails the fiber on a default invitation duration longer than the maximum', async () => {
    const { ctx } = await hostContext()
    const fiber = ctx.plugin(IdentitySqlPlugin, {
      ...IDENTITY_SQL_DEFAULT_CONFIG,
      invitationDefaultDuration: 'PT2592001S',
    })
    await expect(fiber).rejects.toThrow()
    expect(fiber.state as number).toBe(FAILED)
    expect(ctx.get(identityGovernanceKey)).toBeUndefined()
  })

  it('stays PENDING without identityClock and provides neither key', async () => {
    const { ctx } = await hostContext({ clock: false })
    const fiber = ctx.plugin(IdentitySqlPlugin, IDENTITY_SQL_DEFAULT_CONFIG)
    cleanups.push(() => fiber.dispose())
    // Give the fiber every chance to start: it must not, because a required service is absent.
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(fiber.state as number).toBe(PENDING)
    expect(ctx.get(identityOperationsKey)).toBeUndefined()
    expect(ctx.get(tenantStandingKey)).toBeUndefined()
    expect(ctx.get(identityGovernanceKey)).toBeUndefined()
    expect(ctx.get(identityClockKey)).toBeUndefined()
  })

  it(
    'provides three keys over one provider, issues at the injected clock reading, revokes through governance, invalidates when the clock passes the idle deadline, then stops on disposal',
    { tags: ['slow'], timeout: 120_000 },
    async () => {
      const { ctx, storage, clock } = await hostContext()
      const fiber = await ctx.plugin(IdentitySqlPlugin, IDENTITY_SQL_DEFAULT_CONFIG)
      const operations = ctx.get(identityOperationsKey)
      const standing = ctx.get(tenantStandingKey)
      const governance = ctx.get(identityGovernanceKey)
      expect(operations).toBeInstanceOf(IdentityOperationsService)
      expect(standing).toBeInstanceOf(TenantStandingSourceService)
      expect(governance).toBeInstanceOf(IdentityGovernanceService)
      if (operations === undefined || standing === undefined || governance === undefined)
        throw new Error('keys missing')
      // The combination is registered: a second registration is the idempotent recall.
      const { identitySqlRegistration } = await import('@omne-harness/identity-sql')
      expect((await storage.storage.registerCombination(identitySqlRegistration())).kind).toBe(
        'registered',
      )
      const registered = await operations.registerAndActivate({
        loginIdentifier: 'plugin-ada',
        credential: 'credential-ada',
      })
      expect(registered.kind).toBe('succeeded')
      if (registered.kind !== 'succeeded') return
      const issued = await operations.issueLogin({
        loginIdentifier: 'plugin-ada',
        credential: 'credential-ada',
      })
      expect(issued.kind).toBe('succeeded')
      if (issued.kind !== 'succeeded') return
      // The issue time is the injected clock's reading, not the host's time. (`Instant` keeps its
      // fields private, so `toEqual` cannot tell two instants apart; compare the encoded text.)
      expect(encodeInstant(issued.issuedAt)).toBe(encodeInstant(instant(START)))
      const recognized = await operations.recognizeLogin({ loginProof: issued.loginProof })
      expect(recognized.kind).toBe('recognized')
      expect((await standing.read({ tenant: registered.tenant })).kind).toBe('member')

      // The governance key works over the same records: a revocation ends the other login, and
      // the invitation terms come from the configuration's initial values (7 days).
      const other = await operations.issueLogin({
        loginIdentifier: 'plugin-ada',
        credential: 'credential-ada',
      })
      if (other.kind !== 'succeeded') throw new Error('second issue failed')
      expect(await governance.revokeLogin({ login: issued.login, target: other.login })).toEqual({
        kind: 'succeeded',
      })
      expect((await operations.recognizeLogin({ loginProof: other.loginProof })).kind).toBe(
        'invalid',
      )
      const bob = await operations.registerAndActivate({
        loginIdentifier: 'plugin-bob',
        credential: 'credential-bob',
      })
      expect(bob.kind).toBe('succeeded')
      const team = await governance.createOrganization({
        login: issued.login,
        actingTenant: registered.tenant,
        createCallId: 'plugin-team',
        name: 'Plugin team',
        governanceModelId: 'default-team',
      })
      if (team.kind !== 'succeeded') throw new Error(`create ${team.kind}`)
      expect(
        (
          await governance.switchCurrentTenant({
            login: issued.login,
            actingTenant: registered.tenant,
            tenant: team.tenant,
          })
        ).kind,
      ).toBe('succeeded')
      const invited = await governance.issueMemberInvitation({
        login: issued.login,
        actingTenant: team.tenant,
        invitedLoginIdentifier: 'plugin-bob',
      })
      if (invited.kind !== 'succeeded') throw new Error(`invite ${invited.kind}`)
      // No duration asked: the configured default, 7 days after the injected clock reading.
      expect(encodeInstant(invited.expiresAt)).toBe('2026-11-01T12:00:00Z')

      // Past the idle deadline the login is invalid; no waiting, the clock moved.
      const { idle, second } = pastIdlePeriod()
      clock.advanceBy(idle)
      clock.advanceBy(second)
      expect(await operations.recognizeLogin({ loginProof: issued.loginProof })).toEqual({
        kind: 'invalid',
      })

      // An unavailable clock is no verdict about the login.
      clock.makeUnavailable('fixture-offline')
      const noClock = await operations.recognizeLogin({ loginProof: issued.loginProof })
      expect(noClock.kind).toBe('basis-unavailable')
      clock.restore()

      await fiber.dispose()
      expect(ctx.get(identityOperationsKey)).toBeUndefined()
      expect(ctx.get(tenantStandingKey)).toBeUndefined()
      expect(ctx.get(identityGovernanceKey)).toBeUndefined()
      expect(await governance.queryCurrentTenant({ login: issued.login })).toEqual({
        kind: 'basis-unavailable',
        diagnostic: 'provider-stopped',
      })
      // An old reference answers as a stopped provider: no verdict about the login.
      const late = await operations.recognizeLogin({ loginProof: issued.loginProof })
      expect(late.kind).toBe('basis-unavailable')
      expect((await standing.read({ tenant: registered.tenant })).kind).toBe('unavailable')
      expect(
        await operations.registerAndActivate({ loginIdentifier: 'bob', credential: 'c' }),
      ).toEqual({ kind: 'not-loginable' })
    },
  )
})
