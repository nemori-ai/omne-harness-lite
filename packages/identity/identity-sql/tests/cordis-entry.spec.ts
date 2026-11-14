import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import type { SqlStorage } from '@omne-harness/sql-contract'
import { StorageService } from '@omne-harness/sql-contract/cordis'
import {
  inProcessPrincipalAuthority,
  standingPrincipalRef,
  type IdentityClock,
  type StandingDestinationResolver,
} from '@omne-harness/identity'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  IdentityClockService,
  PrincipalVerifierService,
  StandingDestinationResolverService,
  StandingReservationsService,
  IdentityGovernanceRecoveryService,
  standingReservationsKey,
  identityGovernanceRecoveryKey,
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

async function hostContext(options: Readonly<{ clock?: boolean }> = {}): Promise<Host> {
  const storage = await openSqliteStorage()
  cleanups.push(() => storage.close({ remove: true }))
  class TestStorage extends StorageService {
    readonly database = storage.storage.database
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

const CONFIG = Object.freeze({
  maxLifetime: 'PT2592000S',
  idlePeriod: 'PT604800S',
  accessRefreshGranularity: 'PT3600S',
  invitationDefaultDuration: 'PT604800S',
  invitationMaxDuration: 'PT2592000S',
})

function pastIdlePeriod() {
  const idle = parseDuration(CONFIG.idlePeriod)
  if (!idle.ok) throw new Error('fixture: default idle period')
  return { idle: idle.value, second: duration('PT1S') }
}

describe('IdentitySqlPlugin', () => {
  it('injects storage and identityClock, nothing else', () => {
    expect(IdentitySqlPlugin.inject).toEqual(['storage', 'identityClock'])
  })

  it('fails the fiber on an illegal lifetime', async () => {
    const { ctx } = await hostContext()
    const fiber = ctx.plugin(IdentitySqlPlugin, { ...CONFIG, maxLifetime: 'PT0S' })
    await expect(fiber).rejects.toThrow()
    expect(fiber.state as number).toBe(FAILED)
    expect(ctx.get(identityOperationsKey)).toBeUndefined()
  })

  it('fails the fiber on a default invitation duration longer than the maximum', async () => {
    const { ctx } = await hostContext()
    const fiber = ctx.plugin(IdentitySqlPlugin, {
      ...CONFIG,
      invitationDefaultDuration: 'PT2592001S',
    })
    await expect(fiber).rejects.toThrow()
    expect(fiber.state as number).toBe(FAILED)
    expect(ctx.get(identityGovernanceKey)).toBeUndefined()
  })

  it('fails the fiber when the invitation durations are left out', async () => {
    const { ctx } = await hostContext()
    const partial: unknown = { maxLifetime: CONFIG.maxLifetime, idlePeriod: CONFIG.idlePeriod }
    const fiber = ctx.plugin(IdentitySqlPlugin, partial as typeof CONFIG)
    await expect(fiber).rejects.toThrow()
    expect(fiber.state as number).toBe(FAILED)
    expect(ctx.get(identityOperationsKey)).toBeUndefined()
    expect(ctx.get(identityGovernanceKey)).toBeUndefined()
  })

  it('stays PENDING without identityClock and provides neither key', async () => {
    const { ctx } = await hostContext({ clock: false })
    const fiber = ctx.plugin(IdentitySqlPlugin, CONFIG)
    cleanups.push(() => fiber.dispose())
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(fiber.state as number).toBe(PENDING)
    expect(ctx.get(identityOperationsKey)).toBeUndefined()
    expect(ctx.get(tenantStandingKey)).toBeUndefined()
    expect(ctx.get(identityGovernanceKey)).toBeUndefined()
    expect(ctx.get(identityClockKey)).toBeUndefined()
  })

  it(
    'provides five keys over one provider, issues at the injected clock reading, revokes through governance, invalidates when the clock passes the idle deadline, then stops on disposal',
    { tags: ['slow'], timeout: 120_000 },
    async () => {
      const { ctx, storage, clock } = await hostContext()
      const fiber = await ctx.plugin(IdentitySqlPlugin, CONFIG)
      const operations = ctx.get(identityOperationsKey)
      const standing = ctx.get(tenantStandingKey)
      const governance = ctx.get(identityGovernanceKey)
      expect(operations).toBeInstanceOf(IdentityOperationsService)
      expect(standing).toBeInstanceOf(TenantStandingSourceService)
      expect(governance).toBeInstanceOf(IdentityGovernanceService)
      if (operations === undefined || standing === undefined || governance === undefined)
        throw new Error('keys missing')
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
      expect(encodeInstant(issued.issuedAt)).toBe(encodeInstant(instant(START)))
      const recognized = await operations.recognizeLogin({ loginProof: issued.loginProof })
      expect(recognized.kind).toBe('recognized')
      expect((await standing.read({ tenant: registered.tenant })).kind).toBe('member')

      const reservations = ctx.get(standingReservationsKey)
      const recovery = ctx.get(identityGovernanceRecoveryKey)
      expect(reservations).toBeInstanceOf(StandingReservationsService)
      expect(recovery).toBeInstanceOf(IdentityGovernanceRecoveryService)
      if (reservations === undefined || recovery === undefined) throw new Error('coordination keys')
      const authority = inProcessPrincipalAuthority()
      const actor = authority.issuer.issueSystem({ component: 'cordis-test' })
      if (!('ok' in actor)) throw new Error('actor')
      const principal = authority.issuer.issueActingForTenant({
        actor: actor.ok,
        tenant: registered.tenant,
        work: { owner: 'test', work: '1' },
      })
      const scope = tenantCodec.encode(registered.tenant)
      if (!('ok' in principal) || !scope.ok) throw new Error('principal')
      const reserveInput = {
        principal: principal.ok,
        binding: {
          version: 'standing/1' as const,
          owner: 'test',
          operationId: 'cordis-1',
          principalRef: standingPrincipalRef(principal.ok),
          destination: 'test',
          scopeRef: scope.value,
          targetRef: 'target',
          inputDigest: 'input',
        },
        required: [],
      }
      expect((await reservations.reserve(reserveInput)).kind).toBe('unavailable')
      class Verifier extends PrincipalVerifierService {
        readonly verify = authority.verifier.verify
      }
      const verifierFiber = await ctx.plugin(Verifier)
      const held = await reservations.reserve(reserveInput)
      if (held.kind !== 'held') throw new Error('held')
      expect(await reservations.observe(reserveInput)).toEqual(held)
      expect((await reservations.settle(held.reservation)).kind).toBe('unavailable')
      class Resolver extends StandingDestinationResolverService {
        readonly seal: StandingDestinationResolver['seal'] = async reservation => ({
          kind: 'terminal',
          reservation,
          outcome: 'aborted',
        })
      }
      const resolverFiber = await ctx.plugin(Resolver)
      expect(await reservations.settle(held.reservation)).toMatchObject({
        kind: 'terminal',
        outcome: 'aborted',
      })
      await resolverFiber.dispose()
      const secondHold = await reservations.reserve({
        ...reserveInput,
        binding: { ...reserveInput.binding, operationId: 'cordis-2' },
      })
      if (secondHold.kind !== 'held') throw new Error('second hold')
      expect((await reservations.settle(secondHold.reservation)).kind).toBe('unavailable')
      await verifierFiber.dispose()
      expect((await reservations.reserve(reserveInput)).kind).toBe('unavailable')

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
      expect(encodeInstant(invited.expiresAt)).toBe('2026-11-01T12:00:00Z')

      const { idle, second } = pastIdlePeriod()
      clock.advanceBy(idle)
      clock.advanceBy(second)
      expect(await operations.recognizeLogin({ loginProof: issued.loginProof })).toEqual({
        kind: 'invalid',
      })

      clock.makeUnavailable('fixture-offline')
      const noClock = await operations.recognizeLogin({ loginProof: issued.loginProof })
      expect(noClock.kind).toBe('basis-unavailable')
      clock.restore()

      await fiber.dispose()
      expect(ctx.get(identityOperationsKey)).toBeUndefined()
      expect(ctx.get(tenantStandingKey)).toBeUndefined()
      expect(ctx.get(identityGovernanceKey)).toBeUndefined()
      expect(ctx.get(standingReservationsKey)).toBeUndefined()
      expect(ctx.get(identityGovernanceRecoveryKey)).toBeUndefined()
      expect(await governance.queryCurrentTenant({ login: issued.login })).toEqual({
        kind: 'basis-unavailable',
        diagnostic: 'provider-stopped',
      })
      const late = await operations.recognizeLogin({ loginProof: issued.loginProof })
      expect(late.kind).toBe('basis-unavailable')
      expect((await standing.read({ tenant: registered.tenant })).kind).toBe('unavailable')
      expect(
        await operations.registerAndActivate({ loginIdentifier: 'bob', credential: 'c' }),
      ).toEqual({ kind: 'not-loginable' })
    },
  )
})
