import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi, type Mock } from 'vitest'
import { parseOpaqueIdentifier, parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import type { RecoveryAccess } from '@omne-harness-lite/execution-environments'
import type {
  SessionAccess,
  SessionScope,
  AccessIdentity,
} from '@omne-harness-lite/session-tenancy'
import type { SessionLog } from '@omne-harness-lite/session-log'
import { openJsonlSessionLog } from '@omne-harness-lite/session-log-jsonl'
import { createSessionAccessOwner } from '../src/session-access.ts'
import { createSessionLogBacking } from '../src/log-backing.ts'
import { createAuthorizedLogOwner } from '../src/authorized-log-owner.ts'

const scope: SessionScope = {
  tenant: unwrap(parseTenantId({ organization: 'owner-org', account: 'owner-account' })),
  session: unwrap(parseOpaqueIdentifier('owner-session', 'SessionRef')),
}
const second: SessionScope = {
  ...scope,
  session: unwrap(parseOpaqueIdentifier('second-session', 'SessionRef')),
}
const other: SessionScope = {
  tenant: unwrap(parseTenantId({ organization: 'other-org', account: 'other-account' })),
  session: unwrap(parseOpaqueIdentifier('other-session', 'SessionRef')),
}
const unfenced = { kind: 'unfenced' } as const,
  unconditional = { kind: 'unconditional' } as const
const hash = (scope: SessionScope) => createHash('sha256').update(scope.session).digest('hex')
function latch() {
  let resolve!: () => void
  const promise = new Promise<void>(done => {
    resolve = done
  })
  return { resolve, promise }
}
type Catalog = () => Promise<readonly SessionScope[]>
async function fixture(
  test: (f: {
    dir: string
    owner: Awaited<ReturnType<typeof createAuthorizedLogOwner>>
    access: SessionAccess
    accessOwner: ReturnType<typeof createSessionAccessOwner>
    revoke: () => void
    log: Awaited<ReturnType<typeof openJsonlSessionLog>>
    backing: ReturnType<typeof createSessionLogBacking>
    catalog: Mock<Catalog>
    source: SessionLog
  }) => Promise<void>,
) {
  const dir = await mkdtemp(join(tmpdir(), 'authorized-log-owner-'))
  const log = await openJsonlSessionLog({
    dir,
    processOwnership: { current: 'owner-tests', observeExit: async () => 'unknown' },
  })
  const source: SessionLog = { ...log }
  const backing = createSessionLogBacking(source)
  let authorized = true
  const accessOwner = createSessionAccessOwner({
    async check(identity) {
      return authorized
        ? { kind: 'authorized', identity }
        : { kind: 'rejected', reason: 'notAuthorized' }
    },
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
  if (issued.kind !== 'issued') throw new Error('not issued')
  const catalog = vi.fn<Catalog>(async () => [scope, second, other])
  const owner = await createAuthorizedLogOwner({
    dir,
    backing: backing.operations,
    access: accessOwner.operations,
    tenancy: {
      async holdingTenant(session) {
        const found = (await catalog()).find(row => row.session === session)
        return found ? { tenant: found.tenant } : { failure: 'sessionNotFound' }
      },
    },
    catalog,
  })
  try {
    await test({
      dir,
      log,
      source,
      backing,
      owner,
      access: issued.access,
      accessOwner,
      revoke() {
        authorized = false
      },
      catalog,
    })
  } finally {
    await owner.drain()
    await backing.drain()
    await log.close()
    await rm(dir, { recursive: true, force: true })
  }
}

it('enumerates observerless and empty sessions, and returns a complete single-generation prefix', async () => {
  await fixture(async ({ owner, log, dir, access, backing }) => {
    expect(owner.generation).toBe(backing.operations.ownerGeneration)
    await log.append(
      other.session,
      [{ tenant: other.tenant, readKeys: [], payload: 'unobserved result' }],
      unfenced,
      unconditional,
    )
    expect(await owner.operations.enumerate(owner.recovery)).toEqual({
      kind: 'sessions',
      sessions: [scope, second, other].map(scope => ({ scope, locator: join(dir, hash(scope)) })),
    })
    expect(await owner.operations.readPrefix(owner.recovery, scope)).toMatchObject({
      kind: 'prefix',
      prefix: { tail: 0, entries: [], ownerGeneration: owner.generation },
    })
    expect(await owner.operations.readPrefix(owner.recovery, other)).toMatchObject({
      kind: 'prefix',
      prefix: { tail: 1, entries: [{ payload: 'unobserved result' }] },
    })
    expect(await owner.operations.readPrefix(access, other)).toMatchObject({
      reason: 'notAuthorized',
    })
  })
})

it('rejects copied, foreign and ordinary tokens for catalog enumeration before reading storage', async () => {
  await fixture(async ({ owner, access, catalog, dir, backing, accessOwner }) => {
    const foreign = await createAuthorizedLogOwner({
      dir,
      backing: backing.operations,
      access: accessOwner.operations,
      catalog,
      tenancy: {
        async holdingTenant() {
          return { tenant: scope.tenant }
        },
      },
    })
    // Adapter replacement cannot invent a new physical generation or share recovery authority.
    expect(foreign.generation).toBe(owner.generation)
    catalog.mockClear()
    for (const token of [{ ...owner.recovery }, access, foreign.recovery])
      expect(await owner.operations.enumerate(token as RecoveryAccess)).toMatchObject({
        reason: 'notAuthorized',
      })
    expect(await owner.operations.readPrefix({ ...owner.recovery }, scope)).toMatchObject({
      reason: 'notAuthorized',
    })
    expect(catalog).not.toHaveBeenCalled()
    await foreign.drain()
  })
})

it.each(['unknown-directory', 'file', 'symlink'])(
  'does not hide a physical path outside the catalog: %s',
  async kind => {
    await fixture(async ({ owner, dir }) => {
      if (kind === 'unknown-directory') await mkdir(join(dir, 'unmapped'))
      else if (kind === 'symlink') await symlink(dir, join(dir, hash(scope)))
      else await writeFile(join(dir, hash(scope)), 'not a log directory')
      expect(await owner.operations.enumerate(owner.recovery)).toMatchObject({
        reason: 'unavailable',
      })
    })
  },
)

it.each(['duplicate', 'bad-session', 'unavailable'])(
  'does not skip a bad catalog: %s',
  async kind => {
    await fixture(async ({ owner, catalog }) => {
      if (kind === 'duplicate') catalog.mockResolvedValue([scope, scope])
      else if (kind === 'bad-session')
        catalog.mockResolvedValue([
          { ...scope, session: ' invalid-session' as SessionScope['session'] },
        ])
      else catalog.mockRejectedValue(new Error('catalog unavailable'))
      expect(await owner.operations.enumerate(owner.recovery)).toMatchObject({
        reason: 'unavailable',
      })
    })
  },
)

it('rejects a changed physical root during catalog IO', async () => {
  await fixture(async ({ owner, dir, catalog }) => {
    const old = `${dir}.original`
    catalog.mockImplementation(async () => {
      await rename(dir, old)
      await mkdir(dir, { mode: 0o700 })
      return [scope]
    })
    try {
      expect(await owner.operations.enumerate(owner.recovery)).toMatchObject({
        reason: 'unavailable',
      })
    } finally {
      await rm(dir, { recursive: true })
      await rename(old, dir)
    }
  })
})

it('fixes a borrow to its tenant/session and rejects cached IO after revocation or release', async () => {
  await fixture(async ({ owner, access, source, revoke }) => {
    const held = await owner.operations.borrow(access, scope)
    if (held.kind !== 'borrowed') throw new Error('borrow rejected')
    const write = vi.spyOn(source, 'append')
    for (const target of [second, other]) {
      expect(await held.log.readSince(target.session, 0)).toEqual({ failure: 'invalidInput' })
      expect(
        await held.log.append(
          target.session,
          [{ tenant: target.tenant, readKeys: [], payload: 'wrong session' }],
          unfenced,
          unconditional,
        ),
      ).toEqual({ failure: 'invalidInput' })
    }
    expect(
      await held.log.append(
        scope.session,
        [{ tenant: other.tenant, readKeys: [], payload: 'wrong tenant' }],
        unfenced,
        unconditional,
      ),
    ).toEqual({ failure: 'tenantMismatch' })
    expect(write).not.toHaveBeenCalled()
    expect(
      await held.log.append(
        scope.session,
        [{ tenant: scope.tenant, readKeys: [], payload: 'owned' }],
        unfenced,
        unconditional,
      ),
    ).toHaveProperty('tail', 1)
    revoke()
    expect(await held.log.readSince(scope.session, 0)).toEqual({ failure: 'unavailable' })
    expect(
      await held.log.append(
        scope.session,
        [{ tenant: scope.tenant, readKeys: [], payload: 'revoked' }],
        unfenced,
        unconditional,
      ),
    ).toEqual({ failure: 'unavailable' })
    expect(await owner.operations.readPrefix(owner.recovery, scope)).toMatchObject({
      kind: 'prefix',
      prefix: { tail: 1 },
    })
    await held.release()
    expect(await held.log.readByKey(scope.session, 'key')).toEqual({ failure: 'unavailable' })
  })
})

it('does not return a prefix after in-flight revocation, and never grants normal access to recovery authority', async () => {
  await fixture(async ({ owner, access, source, revoke, accessOwner }) => {
    for (const operation of [
      'tool.submit',
      'run.advance',
      'context.configure',
      'context.publish',
    ] as const)
      expect(
        await accessOwner.operations.authorize(
          owner.recovery as unknown as SessionAccess,
          scope,
          operation,
        ),
      ).toMatchObject({ reason: 'notAuthorized' })
    const read = source.readSince,
      entered = latch(),
      gate = latch()
    vi.spyOn(source, 'readSince').mockImplementation(async (...args) => {
      entered.resolve()
      await gate.promise
      return read(...args)
    })
    const result = owner.operations.readPrefix(access, scope)
    await entered.promise
    revoke()
    gate.resolve()
    expect(await result).toMatchObject({ reason: 'unavailable' })
  })
})

it('rechecks revocation during the persistent tenant lookup before physical writes', async () => {
  await fixture(async ({ owner, access, source, revoke, catalog }) => {
    const held = await owner.operations.borrow(access, scope)
    if (held.kind !== 'borrowed') throw new Error('borrow rejected')
    const write = vi.spyOn(source, 'append')
    catalog.mockImplementation(async () => {
      revoke()
      return [scope]
    })
    expect(
      await held.log.append(
        scope.session,
        [{ tenant: scope.tenant, readKeys: [], payload: 'revoked during tenant IO' }],
        unfenced,
        unconditional,
      ),
    ).toEqual({ failure: 'unavailable' })
    expect(write).not.toHaveBeenCalled()
    await held.release()
  })
})

it('drains admitted IO and rejects tokens from a stopped generation', async () => {
  await fixture(async ({ owner, access, source }) => {
    const held = await owner.operations.borrow(access, scope)
    if (held.kind !== 'borrowed') throw new Error('borrow rejected')
    const read = source.readSince,
      entered = latch(),
      gate = latch()
    vi.spyOn(source, 'readSince').mockImplementation(async (...args) => {
      entered.resolve()
      await gate.promise
      return read(...args)
    })
    const reading = held.log.readSince(scope.session, 0)
    await entered.promise
    let drained = false
    const ending = owner.drain().then(() => {
      drained = true
    })
    expect(await owner.operations.enumerate(owner.recovery)).toMatchObject({
      reason: 'ownerStopped',
    })
    expect(await held.log.readSince(scope.session, 0)).toEqual({ failure: 'unavailable' })
    expect(drained).toBe(false)
    gate.resolve()
    await reading
    await ending
    expect(drained).toBe(true)
  })
})

it('does not accept a fragmented prefix as the full commit boundary', async () => {
  await fixture(async ({ owner, log, source }) => {
    await log.append(
      scope.session,
      [1, 2].map(value => ({ tenant: scope.tenant, readKeys: [], payload: value })),
      unfenced,
      unconditional,
    )
    const read = source.readSince
    vi.spyOn(source, 'readSince').mockImplementation(async (...args) => {
      const result = await read(...args)
      return 'failure' in result ? result : { ...result, entries: result.entries.slice(1) }
    })
    expect(await owner.operations.readPrefix(owner.recovery, scope)).toMatchObject({
      reason: 'unavailable',
    })
  })
})

it('rejects accessor-bearing scopes without evaluating caller code or reading storage', async () => {
  await fixture(async ({ owner, access, catalog }) => {
    const getter = vi.fn(() => scope.session)
    const input = {
      tenant: scope.tenant,
      get session() {
        return getter()
      },
    }
    catalog.mockClear()
    expect(await owner.operations.borrow(access, input)).toMatchObject({ reason: 'invalidInput' })
    expect(await owner.operations.readPrefix(access, input)).toMatchObject({
      reason: 'invalidInput',
    })
    expect(getter).not.toHaveBeenCalled()
    expect(catalog).not.toHaveBeenCalled()
  })
})

it('captures a scope before authority IO so caller mutation cannot redirect a borrow', async () => {
  await fixture(async ({ owner, access }) => {
    const input = { ...scope, tenant: { ...scope.tenant } }
    const pending = owner.operations.borrow(access, input)
    input.session = other.session
    input.tenant = other.tenant
    const held = await pending
    if (held.kind !== 'borrowed') throw new Error('original borrow rejected')
    expect(await held.log.readSince(scope.session, 0)).toMatchObject({ tail: 0 })
    expect(await held.log.readSince(other.session, 0)).toEqual({ failure: 'invalidInput' })
    await held.release()
  })
})

it('retains an unknown scoped append through failed release and recognizes its late commit', async () => {
  await fixture(async ({ owner, access, source, log, backing }) => {
    const gate = latch()
    let late: Promise<unknown> | undefined
    vi.spyOn(source, 'append').mockImplementation(async (...args) => {
      late = gate.promise.then(() => log.append(...args))
      return { failure: 'unavailable' }
    })
    const held = await owner.operations.borrow(access, scope)
    if (held.kind !== 'borrowed') throw new Error('borrow rejected')
    expect(
      await held.log.append(
        scope.session,
        [{ tenant: scope.tenant, readKeys: [], dedupeKey: 'original-intent', payload: 'original' }],
        unfenced,
        unconditional,
      ),
    ).toEqual({ failure: 'unavailable' })
    await expect(held.release()).rejects.toThrow('unresolved writes')
    expect(backing.retained).toBe(1)
    expect(await held.log.readSince(scope.session, 0)).toEqual({ failure: 'unavailable' })
    gate.resolve()
    await late
    await held.release()
    expect(backing.retained).toBe(0)
    expect(await log.readSince(scope.session, 0)).toMatchObject({ tail: 1 })
  })
})
