import { describe, expect, it } from 'vitest'
import type { Fiber } from '@deepseek-ai/cordis'
import { LOGINS_SERVICE } from '@omne-harness-lite/account-identity/cordis'
import { type LoginsService } from '@omne-harness-lite/account-identity'
import type { ModelCatalog, OfficialManifest } from '@omne-harness-lite/model-profile-directory'
import { MODEL_CATALOG_SERVICE } from '@omne-harness-lite/model-profile-directory/plugin'
import { FIBER_STATE } from '@omne-harness-lite/kernel-basis/cordis'
import { createSessionTenancyReader } from '@omne-harness-lite/session-tenancy-table'
import {
  MEMBERSHIPS_SERVICE,
  OFFERS_SERVICE,
  ORGANIZATIONS_SERVICE,
} from '@omne-harness-lite/organization-governance/cordis'
import {
  type MembershipsService,
  type OffersService,
  type OrganizationsService,
} from '@omne-harness-lite/organization-governance'
import {
  StorageUnavailable,
  type AtomicStorage,
  type StorageInstance,
} from '@omne-harness-lite/storage'
import {
  createAcceptanceApplication,
  REQUEST_PREPARATION_FIBERS,
  type AcceptanceEvent,
  type AcceptanceHooks,
} from '../src/index.ts'
import { actor, deployment, latch, PASSWORD } from './support.ts'

const official: OfficialManifest['entries'][number] = {
  routeName: 'acceptance/official',
  origin: 'official',
  providers: ['fixture-provider'],
  allowFallback: false,
  inputModalities: ['text'],
  outputModalities: ['text'],
  maxInputTokens: 1024,
  maxOutputTokens: 512,
  inputConstraints: {},
  upstreamInputLimits: {
    maxInputTokens: { status: 'unknown' as const },
    maxRequestBytes: { status: 'unknown' as const },
  },
  adaptation: {
    implementation: { name: 'explicit-fixture', revision: 'i1' },
    definition: { modelId: 'acceptance/official', revision: 'd1' },
    configuration: { revision: 'c1', values: { array: [1, 'two'], nested: { flag: true } } },
  },
}
function catalogFace(
  value: unknown,
): value is Pick<ModelCatalog, 'listProfiles' | 'registerProfile'> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'listProfiles' in value &&
    typeof value.listProfiles === 'function' &&
    'registerProfile' in value &&
    typeof value.registerProfile === 'function'
  )
}
function loginFace(value: unknown): value is Pick<LoginsService, 'revoke'> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'revoke' in value &&
    typeof value.revoke === 'function'
  )
}
function readyApp(
  config: Awaited<ReturnType<typeof deployment>>,
  hooks?: AcceptanceHooks,
  events: AcceptanceEvent[] = [],
) {
  return createAcceptanceApplication(config, {
    stage: 'requestPreparation',
    diagnostics: { record: e => events.push(e) },
    ...(hooks === undefined ? {} : { hooks }),
  })
}

describe('M1 SP1–SP5 real request preparation assembly', () => {
  it('retains default auth stage and rejects both preparation entrances there', async () => {
    const app = createAcceptanceApplication(await deployment('sp-auth'), {
      diagnostics: { record() {} },
    })
    try {
      await app.ready
      const identity = await actor(app)
      expect(await app.readOfficialProfiles(identity)).toEqual({ failure: 'stageClosed' })
      expect(await app.prepareSession(identity, 's1')).toEqual({ failure: 'stageClosed' })
      expect(Object.keys(app.status().fibers)).toHaveLength(8)
    } finally {
      expect((await app.close()).complete).toBe(true)
    }
  })

  it('migrates STT before six-fiber confirmation, then opens the fixed nine-fiber gate', async () => {
    const config = await deployment('sp-gates'),
      events: AcceptanceEvent[] = []
    let reader: ReturnType<typeof createSessionTenancyReader> | undefined
    const app = readyApp(
      config,
      {
        storageOpened(storage) {
          reader = createSessionTenancyReader(storage)
        },
        async beforeConfirm() {
          expect(Object.keys(app.status().fibers)).toHaveLength(6)
          expect(await reader?.holdingTenant('s1')).toEqual({ failure: 'sessionNotFound' })
        },
      },
      events,
    )
    try {
      await app.ready
      expect(Object.isFrozen(REQUEST_PREPARATION_FIBERS)).toBe(true)
      expect(Object.keys(app.status().fibers)).toEqual([...REQUEST_PREPARATION_FIBERS])
      expect(Object.values(app.status().fibers)).toEqual(Array(9).fill(FIBER_STATE.ACTIVE))
      const confirmed = events.findIndex(e => e.event === 'confirm' && e.outcome === 'succeeded')
      expect(
        events.findIndex(e => e.event === 'fiber' && e.fiber === 'sessionTenancy'),
      ).toBeGreaterThan(confirmed)
      const identity = await actor(app)
      expect(await app.prepareSession(identity, 's1')).toEqual({
        session: 's1',
        tenant: identity.tenant,
      })
    } finally {
      await reader?.close()
      expect((await app.close()).complete).toBe(true)
    }
  })

  it('returns complete actual official rows and retains updatedAt/adaptation on reopen', async () => {
    const config = {
      ...(await deployment('sp-profiles')),
      officialManifest: { ordinal: 1, entries: [official] },
    }
    let actualCatalog: Pick<ModelCatalog, 'listProfiles' | 'registerProfile'> | undefined
    const app = readyApp(config, {
      async fiberCreated(name, fiber) {
        if (name === 'directory') {
          await fiber
          const value: unknown = fiber.ctx.get(MODEL_CATALOG_SERVICE)
          if (!catalogFace(value)) throw new Error('actual catalog unavailable')
          actualCatalog = value
        }
      },
    })
    await app.ready
    const identity = await actor(app)
    if (actualCatalog === undefined) throw new Error('catalog not captured')
    const custom = { ...official, origin: 'custom' as const }
    expect(
      await actualCatalog.registerProfile(
        identity.tenant,
        { layer: 'tenant', tenant: identity.tenant },
        custom,
      ),
    ).not.toHaveProperty('failure')
    const actualRows = await actualCatalog.listProfiles(identity.tenant)
    if ('failure' in actualRows) throw new Error('actual list rejected')
    expect(actualRows).toHaveLength(2)
    const rows = await app.readOfficialProfiles(identity)
    expect(rows).toEqual(actualRows.filter(row => row.ref.origin === 'official'))
    expect(rows).toMatchObject([
      { profile: { adaptation: official.adaptation, registration: 'listed' } },
    ])
    expect((await app.close()).complete).toBe(true)
    const reopened = readyApp(config)
    try {
      await reopened.ready
      const current = await reopened.authenticate('alice', PASSWORD)
      if (!('account' in current)) throw new Error('reopen authentication rejected')
      expect(await reopened.readOfficialProfiles(current)).toEqual(rows)
    } finally {
      expect((await reopened.close()).complete).toBe(true)
    }
  })

  it('denies forged actor/currentTenant and revoked login before new reads or seeds', async () => {
    const events: AcceptanceEvent[] = []
    let logins: Pick<LoginsService, 'revoke'> | undefined
    let reader: ReturnType<typeof createSessionTenancyReader> | undefined
    const app = readyApp(
      await deployment('sp-auth-denial'),
      {
        async fiberCreated(name, fiber) {
          if (name === 'accountIdentity') {
            await fiber
            const value: unknown = fiber.ctx.get(LOGINS_SERVICE)
            if (!loginFace(value)) throw new Error('actual logins unavailable')
            logins = value
          }
        },
        storageOpened(storage) {
          reader = createSessionTenancyReader(storage)
        },
      },
      events,
    )
    try {
      await app.ready
      const alice = await actor(app),
        bob = await actor(app, 'bob')
      const before = events.filter(
        e => e.event === 'directory' && e.phase === 'listProfiles',
      ).length
      for (const bad of [
        { ...alice, account: bob.account },
        { ...alice, tenant: bob.tenant },
      ]) {
        expect(await app.readOfficialProfiles(bad)).toEqual({ failure: 'identityMismatch' })
        expect(await app.prepareSession(bad, 'denied')).toEqual({ failure: 'identityMismatch' })
      }
      if (logins === undefined) throw new Error('logins not captured')
      expect(await logins.revoke(alice.loginState, alice.loginState)).toBe('ok')
      expect(await app.readOfficialProfiles(alice)).toHaveProperty('step', 'verify')
      expect(await app.prepareSession(alice, 'denied')).toHaveProperty('step', 'verify')
      expect(await reader?.holdingTenant('denied')).toEqual({ failure: 'sessionNotFound' })
      await reader?.close()
      expect(
        events.filter(e => e.event === 'directory' && e.phase === 'listProfiles'),
      ).toHaveLength(before)
    } finally {
      expect((await app.close()).complete).toBe(true)
    }
  })

  it('persists same-tenant idempotence and refuses another real tenant, including after reopen', async () => {
    const config = await deployment('sp-tenancy')
    const app = readyApp(config)
    await app.ready
    const alice = await actor(app),
      bob = await actor(app, 'bob')
    expect(await app.prepareSession(alice, 's1')).toEqual({ session: 's1', tenant: alice.tenant })
    expect(await app.prepareSession(alice, 's1')).toEqual({ session: 's1', tenant: alice.tenant })
    await expect(app.prepareSession(bob, 's1')).rejects.toMatchObject({
      name: 'UniqueViolation',
      constraint: 'unregistered',
    })
    expect(await app.prepareSession(alice, 's1')).toEqual({ session: 's1', tenant: alice.tenant })
    expect((await app.close()).complete).toBe(true)
    const reopened = readyApp(config)
    try {
      await reopened.ready
      const current = await reopened.authenticate('alice', PASSWORD)
      if (!('account' in current)) throw new Error('reopen authentication rejected')
      expect(await reopened.prepareSession(current, 's1')).toEqual({
        session: 's1',
        tenant: alice.tenant,
      })
      expect(await reopened.prepareSession(current, ' s1')).toEqual({
        step: 'holdingTenant',
        result: { failure: 'invalidInput' },
      })
      expect(await reopened.prepareSession(current, undefined)).toEqual({
        step: 'holdingTenant',
        result: { failure: 'invalidInput' },
      })
    } finally {
      expect((await reopened.close()).complete).toBe(true)
    }
  })

  it('separates an empty official list from unavailable and never seeds an unreadable mapping', async () => {
    const config = await deployment('sp-unavailable')
    let directoryRead = false,
      fault = false,
      seeds = 0,
      holdingFailed = false
    const app = createAcceptanceApplication(config, {
      stage: 'requestPreparation',
      diagnostics: {
        record(e) {
          if (e.event === 'directory' && e.phase === 'listProfiles')
            directoryRead = e.outcome === 'start'
        },
      },
      hooks: {
        storageOpened(storage) {
          const read = storage.read.bind(storage),
            atomic = storage.atomic.bind(storage)
          storage.read = async work => {
            if (fault && directoryRead)
              throw new StorageUnavailable('controlled actual directory storage fault')
            const result = await read(work)
            if (
              fault &&
              typeof result === 'object' &&
              result !== null &&
              'failure' in result &&
              result.failure === 'sessionNotFound'
            ) {
              holdingFailed = true
              throw new StorageUnavailable('controlled actual holding storage fault')
            }
            return result
          }
          storage.atomic = async work => {
            if (holdingFailed) seeds++
            return atomic(work)
          }
        },
      },
    })
    try {
      await app.ready
      const identity = await actor(app)
      expect(await app.readOfficialProfiles(identity)).toEqual([])
      fault = true
      expect(await app.readOfficialProfiles(identity)).toEqual({
        step: 'listProfiles',
        result: { failure: 'unavailable' },
      })
      expect(await app.prepareSession(identity, 'no-read')).toEqual({
        step: 'holdingTenant',
        result: { failure: 'unavailable' },
      })
      expect(seeds).toBe(0)
    } finally {
      expect((await app.close()).complete).toBe(true)
    }
  })

  for (const boundary of ['profiles', 'holdingTenant', 'seed'] as const)
    it(`drains actual ${boundary} work before releasing storage and rejects new admission`, async () => {
      const config = await deployment(`sp-close-${boundary}`),
        entered = latch(),
        release = latch()
      let block = false,
        paused = false,
        directoryRead = false
      const events: AcceptanceEvent[] = []
      const app = createAcceptanceApplication(config, {
        stage: 'requestPreparation',
        diagnostics: {
          record(e) {
            events.push(e)
            if (e.event === 'directory' && e.phase === 'listProfiles')
              directoryRead = e.outcome === 'start'
          },
        },
        hooks: {
          storageOpened(storage) {
            const read = storage.read.bind(storage),
              atomic = storage.atomic.bind(storage)
            storage.read = async work =>
              read(async tx => {
                const result = await work(tx)
                if (
                  block &&
                  !paused &&
                  ((boundary === 'profiles' && directoryRead) ||
                    (boundary === 'holdingTenant' &&
                      typeof result === 'object' &&
                      result !== null &&
                      'tenant' in result))
                ) {
                  paused = true
                  entered.resolve()
                  await release.promise
                }
                return result
              })
            storage.atomic = async work =>
              atomic(async unit => {
                const result = await work(unit)
                if (block && !paused && boundary === 'seed') {
                  paused = true
                  entered.resolve()
                  await release.promise
                }
                return result
              })
          },
        },
      })
      await app.ready
      const identity = await actor(app)
      if (boundary === 'holdingTenant') await app.prepareSession(identity, 's1')
      block = true
      const work =
        boundary === 'profiles'
          ? app.readOfficialProfiles(identity)
          : app.prepareSession(identity, 's1')
      await entered.promise
      const closing = app.close()
      expect(app.status().inFlight).toBe(1)
      expect(await app.readOfficialProfiles(identity)).toEqual({ failure: 'stageClosed' })
      expect(await app.prepareSession(identity, 'new')).toEqual({ failure: 'stageClosed' })
      expect(events.some(e => e.event === 'close' && e.phase === 'storageOwner')).toBe(false)
      release.resolve()
      expect(await work).toEqual(
        boundary === 'profiles' ? [] : { session: 's1', tenant: identity.tenant },
      )
      expect((await closing).complete).toBe(true)
      expect(
        events.findIndex(e => e.event === 'close' && e.phase === 'sessionTenancy'),
      ).toBeLessThan(events.findIndex(e => e.event === 'close' && e.phase === 'storageOwner'))
    })

  it('keeps the required ninth fiber on post-confirm failure and preserves committed manifest', async () => {
    const config = {
        ...(await deployment('sp-stt-failure')),
        officialManifest: { ordinal: 2, entries: [official] },
      },
      events: AcceptanceEvent[] = []
    const app = readyApp(
      config,
      {
        async fiberCreated(name, fiber) {
          if (name === 'sessionTenancy') await fiber.dispose()
        },
      },
      events,
    )
    await expect(app.ready).rejects.toMatchObject({ phase: 'sessionTenancy', category: 'failed' })
    expect(Object.keys(app.status().fibers)).toEqual([...REQUEST_PREPARATION_FIBERS])
    expect(events.some(e => e.event === 'confirm' && e.outcome === 'succeeded')).toBe(true)
    expect((await app.close()).complete).toBe(true)
    const reopened = readyApp({ ...config, officialManifest: { ordinal: 1, entries: [] } })
    await reopened.ready
    const identity = await actor(reopened)
    expect(await reopened.readOfficialProfiles(identity)).toMatchObject([
      { profile: { routeName: official.routeName } },
    ])
    expect((await reopened.close()).complete).toBe(true)
  })

  it('refuses preparation after actual dependency loss makes the STT fiber pending', async () => {
    let storageFiber: Fiber | undefined, sessionFiber: Fiber | undefined
    const app = readyApp(await deployment('sp-stt-pending'), {
      fiberCreated(name, fiber) {
        if (name === 'storage') storageFiber = fiber
        if (name === 'sessionTenancy') sessionFiber = fiber
      },
    })
    await app.ready
    const identity = await actor(app)
    if (storageFiber === undefined || sessionFiber === undefined)
      throw new Error('fibers not captured')
    await storageFiber.dispose()
    await sessionFiber.await()
    expect(sessionFiber.state).toBe(FIBER_STATE.PENDING)
    expect(await app.prepareSession(identity, 's1')).toEqual({ failure: 'stageClosed' })
    expect(await app.readOfficialProfiles(identity)).toEqual({ failure: 'stageClosed' })
    expect((await app.close()).complete).toBe(true)
  })
  it('arbitrates simultaneous same-session preparation through the actual atomic seed', async () => {
    const app = readyApp(await deployment('sp-seed-race'))
    try {
      await app.ready
      const alice = await actor(app),
        bob = await actor(app, 'bob')
      expect(
        await Promise.all([app.prepareSession(alice, 'same'), app.prepareSession(alice, 'same')]),
      ).toEqual([
        { session: 'same', tenant: alice.tenant },
        { session: 'same', tenant: alice.tenant },
      ])
      const results = await Promise.allSettled([
        app.prepareSession(alice, 'race'),
        app.prepareSession(bob, 'race'),
      ])
      const fulfilled = results.filter(result => result.status === 'fulfilled')
      expect(fulfilled).toHaveLength(1)
      const rejected = results.find(result => result.status === 'rejected')
      expect(rejected).toMatchObject({
        status: 'rejected',
        reason: { name: 'UniqueViolation', constraint: 'unregistered' },
      })
      const winner = fulfilled[0]
      if (winner === undefined || winner.status !== 'fulfilled' || !('tenant' in winner.value))
        throw new Error('no actual prepared owner')
      expect(
        await app.prepareSession(
          winner.value.tenant.account === alice.account ? alice : bob,
          'race',
        ),
      ).toEqual(winner.value)
    } finally {
      expect((await app.close()).complete).toBe(true)
    }
  })

  for (const name of ['sessionTenancy', 'accountIdentity'] as const)
    it(`rejects new preparation while actual ${name} is FAILED`, async () => {
      let selected: Fiber | undefined
      const app = readyApp(await deployment(`sp-failed-${name}`), {
        fiberCreated(current, fiber) {
          if (current === name) selected = fiber
        },
      })
      try {
        await app.ready
        const identity = await actor(app)
        if (selected === undefined) throw new Error('actual fiber not captured')
        const target = selected
        const remove = target.ctx.root.on(
          'internal/config',
          function (_config, next) {
            if (this.uid === target.uid) throw new Error('controlled config resolution failure')
            return next()
          },
          { global: true },
        )
        await expect(target.restart()).rejects.toThrow('controlled config resolution failure')
        remove()
        expect(target.state).toBe(FIBER_STATE.FAILED)
        expect(await app.prepareSession(identity, 's1')).toEqual({ failure: 'stageClosed' })
        expect(await app.readOfficialProfiles(identity)).toEqual({ failure: 'stageClosed' })
      } finally {
        expect((await app.close()).complete).toBe(true)
      }
    })
  it('rechecks effective standing after the real selected team membership is removed', async () => {
    let governanceFiber: Fiber | undefined
    let reader: ReturnType<typeof createSessionTenancyReader> | undefined
    const app = readyApp(await deployment('sp-standing'), {
      fiberCreated(name, fiber) {
        if (name === 'governance') governanceFiber = fiber
      },
      storageOpened(storage) {
        reader = createSessionTenancyReader(storage)
      },
    })
    function organizationsFace(value: unknown): value is Pick<OrganizationsService, 'createTeam'> {
      return (
        typeof value === 'object' &&
        value !== null &&
        'createTeam' in value &&
        typeof value.createTeam === 'function'
      )
    }
    function offersFace(
      value: unknown,
    ): value is Pick<OffersService, 'issueInvitation' | 'acceptInvitation'> {
      return (
        typeof value === 'object' &&
        value !== null &&
        'issueInvitation' in value &&
        typeof value.issueInvitation === 'function' &&
        'acceptInvitation' in value &&
        typeof value.acceptInvitation === 'function'
      )
    }
    function membershipsFace(
      value: unknown,
    ): value is Pick<MembershipsService, 'switchCurrentTenant' | 'remove'> {
      return (
        typeof value === 'object' &&
        value !== null &&
        'switchCurrentTenant' in value &&
        typeof value.switchCurrentTenant === 'function' &&
        'remove' in value &&
        typeof value.remove === 'function'
      )
    }
    try {
      await app.ready
      const alice = await actor(app),
        bob = await actor(app, 'bob')
      if (governanceFiber === undefined) throw new Error('governance not captured')
      const organizations: unknown = governanceFiber.ctx.get(ORGANIZATIONS_SERVICE),
        offers: unknown = governanceFiber.ctx.get(OFFERS_SERVICE),
        memberships: unknown = governanceFiber.ctx.get(MEMBERSHIPS_SERVICE)
      if (!organizationsFace(organizations) || !offersFace(offers) || !membershipsFace(memberships))
        throw new Error('actual governance mapping invalid')
      const team = await organizations.createTeam(alice.account, 'standing-team')
      if (!('ok' in team)) throw new Error('team creation rejected')
      const invite = await offers.issueInvitation(team.ok.tenant, bob.account, 'member')
      if (!('ok' in invite)) throw new Error('invitation rejected')
      const accepted = await offers.acceptInvitation(bob.account, invite.ok)
      if (!('ok' in accepted)) throw new Error('acceptance rejected')
      expect(await memberships.switchCurrentTenant(bob.loginState, accepted.ok)).toBe('ok')
      const selected = { ...bob, tenant: accepted.ok }
      expect(await app.readOfficialProfiles(selected)).toEqual([])
      expect(await app.prepareSession(selected, 'before-removal')).toEqual({
        session: 'before-removal',
        tenant: accepted.ok,
      })
      expect(await memberships.remove(team.ok.tenant, accepted.ok)).toBe('ok')
      expect(await app.readOfficialProfiles(selected)).toEqual({
        failure: 'membershipNotEffective',
      })
      expect(await app.prepareSession(selected, 'after-removal')).toEqual({
        failure: 'membershipNotEffective',
      })
      expect(await reader?.holdingTenant('after-removal')).toEqual({ failure: 'sessionNotFound' })
      expect(await reader?.holdingTenant('before-removal')).toEqual({ tenant: accepted.ok })
    } finally {
      await reader?.close()
      expect((await app.close()).complete).toBe(true)
    }
  })

  it('reports an actual storage owner close rejection as unfinished', async () => {
    let closeOwner: (() => Promise<void>) | undefined
    let rootFiber: Fiber | undefined
    function closeable(
      storage: AtomicStorage,
    ): storage is AtomicStorage & Pick<StorageInstance, 'close'> {
      return 'close' in storage && typeof storage.close === 'function'
    }
    const app = readyApp(await deployment('sp-close-failure'), {
      fiberCreated(_name, fiber) {
        rootFiber = fiber.ctx.root.fiber
      },
      storageOpened(storage) {
        if (!closeable(storage)) throw new Error('actual storage owner absent')
        closeOwner = storage.close.bind(storage)
        storage.close = async () => {
          throw new StorageUnavailable('controlled actual close rejection')
        }
      },
    })
    await app.ready
    const identity = await actor(app)
    await app.prepareSession(identity, 's1')
    const closed = await app.close()
    expect(closed).toMatchObject({ complete: false, unfinished: ['storageOwner'] })
    expect(await app.readOfficialProfiles(identity)).toEqual({ failure: 'stageClosed' })
    expect(await app.prepareSession(identity, 's2')).toEqual({ failure: 'stageClosed' })
    // The faulted public close method has not released the SQL owner; the trusted test owns recovery.
    await closeOwner?.()
    await rootFiber?.dispose()
  })
})
