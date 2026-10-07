import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { parseOpaqueIdentifier, parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import type { RecoveryAccess } from '@omne-harness-lite/execution-environments'
import type {
  SessionAccess,
  SessionScope,
  AccessIdentity,
} from '@omne-harness-lite/session-tenancy'
import { StorageDefect, StorageUnavailable } from '@omne-harness-lite/storage'
import { openSqlLogFixture } from './sql-log-fixture.ts'
import { createSessionAccessOwner } from '../src/session-access.ts'
import { createAuthorizedLogOwner } from '../src/authorized-log-owner.ts'
const scope: SessionScope = {
  tenant: unwrap(parseTenantId({ organization: 'owner-org', account: 'owner-account' })),
  session: unwrap(parseOpaqueIdentifier('owner-session', 'SessionRef')),
}
const second = { ...scope, session: unwrap(parseOpaqueIdentifier('second-session', 'SessionRef')) }
const other = {
  tenant: unwrap(parseTenantId({ organization: 'other-org', account: 'other-account' })),
  session: unwrap(parseOpaqueIdentifier('other-session', 'SessionRef')),
}
const unfenced = { kind: 'unfenced' } as const,
  unconditional = { kind: 'unconditional' } as const
const latch = () => Promise.withResolvers<void>()
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'authorized-log-owner-'))
  let authorized = true
  const accessOwner = createSessionAccessOwner({
    async check(identity) {
      return authorized
        ? { kind: 'authorized', identity }
        : { kind: 'rejected', reason: 'notAuthorized' }
    },
  })
  const check = vi.fn(async (candidate: unknown, candidateScope: SessionScope) => {
    const decision = await accessOwner.operations.authorize(
      candidate as SessionAccess,
      candidateScope,
      'session.log.coordinate',
    )
    return { kind: decision.kind === 'authorized' ? ('authorized' as const) : ('denied' as const) }
  })
  const log = await openSqlLogFixture({
    dir,
    authorize: (_unit, candidate, candidateScope) => check(candidate, candidateScope),
  })
  const identity: AccessIdentity = {
    binding: 'owner-binding',
    principal: 'owner-account',
    principalKind: 'human',
    scope,
    consumer: 'coordinator',
    contextKeys: [],
  }
  const issued = await accessOwner
    .issuerFor(identity)
    .issue({ ...identity, operations: ['session.log.coordinate'] })
  if (issued.kind !== 'issued') throw Error('access not issued')
  const catalog = vi.fn(async (): Promise<readonly SessionScope[]> => [scope, second, other])
  const owner = await createAuthorizedLogOwner({
    owner: log.owner,
    generation: log.backing.ownerGeneration,
    recovery: log.fixtureAccess as RecoveryAccess,
    catalog,
  })
  return {
    dir,
    log,
    owner,
    catalog,
    access: issued.access,
    accessOwner,
    check,
    revoke() {
      authorized = false
    },
    async close() {
      vi.restoreAllMocks()
      await owner.drain()
      await log.close()
      await rm(dir, { recursive: true, force: true })
    },
  }
}
async function withFixture(work: (f: Awaited<ReturnType<typeof fixture>>) => Promise<void>) {
  const f = await fixture()
  try {
    await work(f)
  } finally {
    await f.close()
  }
}
it('enumerates observerless and empty catalog sessions using the actual physical generation', async () =>
  withFixture(async f => {
    expect(f.owner.generation).toBe(f.log.backing.ownerGeneration)
    await f.log.append(
      other.session,
      [{ tenant: other.tenant, readKeys: [], payload: 'unobserved result' }],
      unfenced,
      unconditional,
    )
    expect(await f.owner.operations.enumerate(f.owner.recovery)).toEqual({
      kind: 'sessions',
      sessions: [scope, second, other].map(scope => ({ scope, locator: scope.session })),
    })
    expect(await f.owner.operations.readPrefix(f.owner.recovery, scope)).toMatchObject({
      kind: 'prefix',
      prefix: { tail: 0, entries: [], ownerGeneration: f.owner.generation },
    })
    expect(await f.owner.operations.readPrefix(f.owner.recovery, other)).toMatchObject({
      kind: 'prefix',
      prefix: { tail: 1, entries: [{ payload: 'unobserved result' }] },
    })
    expect(await f.owner.operations.readPrefix(f.access, other)).toMatchObject({
      reason: 'notAuthorized',
    })
  }))
it('rejects copied, foreign and ordinary recovery tokens before catalog IO', async () =>
  withFixture(async f => {
    const foreign = await createAuthorizedLogOwner({
      owner: f.log.owner,
      generation: f.owner.generation,
      recovery: Object.freeze({}) as RecoveryAccess,
      catalog: f.catalog,
    })
    f.catalog.mockClear()
    for (const token of [{ ...f.owner.recovery }, f.access, foreign.recovery])
      expect(await f.owner.operations.enumerate(token as RecoveryAccess)).toMatchObject({
        reason: 'notAuthorized',
      })
    expect(await f.owner.operations.readPrefix({ ...f.owner.recovery }, scope)).toMatchObject({
      reason: 'notAuthorized',
    })
    expect(f.catalog).not.toHaveBeenCalled()
    await foreign.drain()
  }))
it.each(['unknown-journal', 'mismatched-tenant'])(
  'does not hide a physical journal outside its catalog: %s',
  async kind =>
    withFixture(async f => {
      const target =
        kind === 'unknown-journal'
          ? { ...scope, session: unwrap(parseOpaqueIdentifier('unmapped', 'SessionRef')) }
          : { ...scope, tenant: other.tenant }
      await f.log.append(
        target.session,
        [{ tenant: target.tenant, readKeys: [], payload: 'uncatalogued' }],
        unfenced,
        unconditional,
      )
      expect(await f.owner.operations.enumerate(f.owner.recovery)).toMatchObject({
        reason: 'unavailable',
      })
    }),
)
it.each(['duplicate', 'bad-session', 'unavailable'])(
  'does not skip a bad catalog: %s',
  async kind =>
    withFixture(async f => {
      if (kind === 'duplicate') f.catalog.mockResolvedValue([scope, scope])
      else if (kind === 'bad-session')
        f.catalog.mockResolvedValue([
          { ...scope, session: ' invalid-session' as SessionScope['session'] },
        ])
      else f.catalog.mockRejectedValue(new StorageUnavailable('catalog IO unavailable'))
      expect(await f.owner.operations.enumerate(f.owner.recovery)).toMatchObject({
        reason: 'unavailable',
      })
    }),
)
it('rejects an owner stopped while catalog IO is in flight', async () =>
  withFixture(async f => {
    f.catalog.mockImplementation(async () => {
      await f.log.close()
      return [scope]
    })
    expect(await f.owner.operations.enumerate(f.owner.recovery)).toMatchObject({
      reason: 'ownerStopped',
    })
  }))
it('fixes each borrow to tenant/session and rejects cached IO after revocation or release', async () =>
  withFixture(async f => {
    const held = await f.owner.operations.borrow(f.access, scope)
    if (held.kind !== 'borrowed') throw Error('borrow rejected')
    for (const target of [second, other]) {
      expect(await held.log.readSince(target.session, 0)).toEqual({ failure: 'unavailable' })
      expect(
        await held.log.append(
          target.session,
          [{ tenant: target.tenant, readKeys: [], payload: 'wrong session' }],
          unfenced,
          unconditional,
        ),
      ).toEqual({ failure: 'unavailable' })
    }
    expect(
      await held.log.append(
        scope.session,
        [{ tenant: other.tenant, readKeys: [], payload: 'wrong tenant' }],
        unfenced,
        unconditional,
      ),
    ).toEqual({ failure: 'tenantMismatch' })
    expect(
      await held.log.append(
        scope.session,
        [{ tenant: scope.tenant, readKeys: [], payload: 'owned' }],
        unfenced,
        unconditional,
      ),
    ).toHaveProperty('tail', 1)
    f.revoke()
    expect(await held.log.readSince(scope.session, 0)).toEqual({ failure: 'unavailable' })
    expect(
      await held.log.append(
        scope.session,
        [{ tenant: scope.tenant, readKeys: [], payload: 'revoked' }],
        unfenced,
        unconditional,
      ),
    ).toEqual({ failure: 'unavailable' })
    expect(await f.owner.operations.readPrefix(f.owner.recovery, scope)).toMatchObject({
      kind: 'prefix',
      prefix: { tail: 1 },
    })
    await held.release()
    expect(await held.log.readByKey(scope.session, 'key')).toEqual({ failure: 'unavailable' })
  }))
it('never grants ordinary access to recovery and rechecks in-flight authorization before reading', async () =>
  withFixture(async f => {
    for (const operation of [
      'tool.submit',
      'run.advance',
      'context.configure',
      'context.publish',
    ] as const)
      expect(
        await f.accessOwner.operations.authorize(
          f.owner.recovery as unknown as SessionAccess,
          scope,
          operation,
        ),
      ).toMatchObject({ reason: 'notAuthorized' })
    const held = await f.owner.operations.borrow(f.access, scope)
    if (held.kind !== 'borrowed') throw Error('borrow rejected')
    await held.release()
    const entered = latch(),
      gate = latch(),
      check = f.check.getMockImplementation()!
    f.check.mockImplementation(async (...args) => {
      entered.resolve()
      await gate.promise
      return check(...args)
    })
    const reading = f.owner.operations.readPrefix(f.access, scope)
    await entered.promise
    f.revoke()
    gate.resolve()
    expect(await reading).toMatchObject({ reason: 'notAuthorized' })
  }))
it('rechecks current authorization inside the persistent write unit', async () =>
  withFixture(async f => {
    const held = await f.owner.operations.borrow(f.access, scope)
    if (held.kind !== 'borrowed') throw Error('borrow rejected')
    const check = f.check.getMockImplementation()!
    f.check.mockImplementation(async (...args) => {
      f.revoke()
      return check(...args)
    })
    expect(
      await held.log.append(
        scope.session,
        [{ tenant: scope.tenant, readKeys: [], payload: 'denied in unit' }],
        unfenced,
        unconditional,
      ),
    ).toEqual({ failure: 'unavailable' })
    expect(await f.log.readSince(scope.session, 0)).toEqual({ entries: [], tail: 0 })
    await held.release()
  }))
it('drains admitted SQL IO and immediately closes cached borrow admission', async () =>
  withFixture(async f => {
    const held = await f.owner.operations.borrow(f.access, scope)
    if (held.kind !== 'borrowed') throw Error('borrow rejected')
    const entered = latch(),
      gate = latch(),
      check = f.check.getMockImplementation()!
    f.check.mockImplementation(async (...args) => {
      entered.resolve()
      await gate.promise
      return check(...args)
    })
    const reading = held.log.readSince(scope.session, 0)
    await entered.promise
    let drained = false
    const ending = f.owner.drain().then(() => {
      drained = true
    })
    expect(await f.owner.operations.enumerate(f.owner.recovery)).toMatchObject({
      reason: 'ownerStopped',
    })
    expect(await held.log.readSince(scope.session, 0)).toEqual({ failure: 'unavailable' })
    expect(drained).toBe(false)
    gate.resolve()
    await reading
    await ending
    expect(drained).toBe(true)
  }))
it('fails on a fragmented physical prefix rather than certifying the commit boundary', async () =>
  withFixture(async f => {
    await f.log.append(
      scope.session,
      [1, 2].map(payload => ({ tenant: scope.tenant, readKeys: [], payload })),
      unfenced,
      unconditional,
    )
    await f.log.fixtureStorage.write(tx =>
      tx.db.deleteFrom('sl_entry').where('position', '=', '1').execute(),
    )
    await expect(f.owner.operations.readPrefix(f.owner.recovery, scope)).rejects.toBeInstanceOf(
      StorageDefect,
    )
  }))
it('rejects accessor scopes without executing caller code or reading authority', async () =>
  withFixture(async f => {
    const getter = vi.fn(() => scope.session),
      input = {
        tenant: scope.tenant,
        get session() {
          return getter()
        },
      }
    expect(await f.owner.operations.borrow(f.access, input)).toMatchObject({
      reason: 'invalidInput',
    })
    expect(await f.owner.operations.readPrefix(f.access, input)).toMatchObject({
      reason: 'invalidInput',
    })
    expect(getter).not.toHaveBeenCalled()
    expect(f.check).not.toHaveBeenCalled()
  }))
it('captures a scope before authority IO so caller mutation cannot redirect the borrow', async () =>
  withFixture(async f => {
    const input = { ...scope, tenant: { ...scope.tenant } },
      pending = f.owner.operations.borrow(f.access, input)
    input.session = other.session
    input.tenant = other.tenant
    const held = await pending
    if (held.kind !== 'borrowed') throw Error('borrow rejected')
    expect(await held.log.readSince(scope.session, 0)).toMatchObject({ tail: 0 })
    expect(await held.log.readSince(other.session, 0)).toEqual({ failure: 'unavailable' })
    await held.release()
  }))
it('retains unknown original writes through failed release until the complete SQL batch is recognized', async () =>
  withFixture(async f => {
    const held = await f.owner.operations.borrow(f.access, scope)
    if (held.kind !== 'borrowed') throw Error('borrow rejected')
    const write = f.log.fixtureStorage.write.bind(f.log.fixtureStorage)
    const lost = vi.spyOn(f.log.fixtureStorage, 'write').mockImplementation(async callback => {
      await write(callback)
      throw new StorageUnavailable('lost receipt after real commit')
    })
    const hidden = vi
      .spyOn(f.log.fixtureStorage, 'read')
      .mockRejectedValue(new StorageUnavailable('recognition IO unavailable'))
    expect(
      await held.log.append(
        scope.session,
        [{ tenant: scope.tenant, dedupeKey: 'original-intent', readKeys: [], payload: 'original' }],
        unfenced,
        unconditional,
      ),
    ).toEqual({ failure: 'unavailable' })
    await expect(held.release()).rejects.toBeInstanceOf(StorageUnavailable)
    expect(await held.log.readSince(scope.session, 0)).toEqual({ failure: 'unavailable' })
    lost.mockRestore()
    hidden.mockRestore()
    await held.release()
    expect(await f.log.readSince(scope.session, 0)).toMatchObject({
      tail: 1,
      entries: [{ dedupeKey: 'original-intent', payload: 'original' }],
    })
  }))
