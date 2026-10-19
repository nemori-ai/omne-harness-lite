// The local start coordinator (G5) as the start ordering domain of P04: permits, consume,
// inspect, invalidate and exclude over the `host` domain of a non-durable ledger store.
import type { ContentBlock } from '@omne-harness/content-block'
import { describe, expect, it } from 'vitest'
import { createMemoryToolLedgerStore } from '@omne-harness/tool/testing'
import type { StartGuard, StartPermit } from '@omne-harness/tool-contract'
import { createLocalStartCoordinator } from '@omne-harness/tool-host-local'
import {
  access,
  callAccess,
  callId,
  coordinator,
  evidence,
  failingNextCommit,
  operationId,
  permission,
  principalA,
  principalB,
  request,
  startOf,
  tenantA,
  tenantB,
} from './coordinator-values.ts'

function ok<T>(outcome: { ok: T } | { failure: unknown }): T {
  if (!('ok' in outcome)) throw new Error(`expected success: ${JSON.stringify(outcome)}`)
  return outcome.ok
}

const invalidation = (operation: string) => ({
  principal: principalA,
  tenant: tenantA as never,
  operation: operationId(operation),
  guard: {
    ...permission,
    revision: '0',
    evidence: evidence('g'),
    scope: { kind: 'resource' },
  } as const,
})

async function permitFor(
  authority: ReturnType<typeof coordinator>,
  call: string,
): Promise<StartPermit> {
  return ok(
    await authority.prepare({ ...callAccess(call), start: startOf(call), request: request() }),
  )
}

const consumeWith = (permit: StartPermit, call = 'c1') => ({
  ...callAccess(call),
  permit,
  executorReceipt: evidence(`capsule-${call}`),
})

describe('G5 the start ordering domain', () => {
  it('G5 order: an invalidation that returned before the consume rejects the start for good', async () => {
    const authority = coordinator(createMemoryToolLedgerStore<ContentBlock>())
    const permit = await permitFor(authority, 'c1')
    ok(await authority.invalidate(invalidation('revoke-1')))
    const consumed = ok(await authority.consume(consumeWith(permit)))
    expect(consumed).toMatchObject({
      kind: 'rejected',
      reason: expect.stringContaining('permissions'),
    })
    expect(ok(await authority.inspect({ ...callAccess('c1'), start: startOf('c1') }))).toEqual(
      consumed,
    )
    // A new permit for the same start cannot undo the rejection.
    const again = await permitFor(authority, 'c1')
    expect(ok(await authority.consume(consumeWith(again)))).toEqual(consumed)
  })

  it('G5 order: a consume that was accepted before the invalidation stays in flight', async () => {
    const authority = coordinator(createMemoryToolLedgerStore<ContentBlock>())
    const permit = await permitFor(authority, 'c1')
    const accepted = ok(await authority.consume(consumeWith(permit)))
    expect(accepted.kind).toBe('started')
    ok(await authority.invalidate(invalidation('revoke-1')))
    expect(ok(await authority.consume(consumeWith(permit)))).toEqual(accepted)
    expect(ok(await authority.inspect({ ...callAccess('c1'), start: startOf('c1') }))).toEqual(
      accepted,
    )
  })

  it('G5 order: a concurrent invalidation and consume are decided in one order, and the answer agrees with it', async () => {
    const seen = new Set<string>()
    for (let delay = 0; delay < 8; delay += 1) {
      const authority = coordinator(createMemoryToolLedgerStore<ContentBlock>())
      const permit = await permitFor(authority, 'c1')
      const later = async () => {
        for (let turn = 0; turn < delay; turn += 1) await Promise.resolve()
      }
      const [invalidated, consumed] = await Promise.all([
        later().then(() => authority.invalidate(invalidation('revoke-1'))),
        authority.consume(consumeWith(permit)),
      ])
      const guard = BigInt(ok(invalidated).revision)
      const answer = ok(consumed)
      if (answer.kind === 'rejected')
        expect(BigInt(answer.exclusion.revision)).toBeGreaterThan(guard)
      else if (answer.kind === 'started')
        expect(BigInt(answer.acceptance.revision)).toBeLessThan(guard)
      else throw new Error(`unexpected answer ${answer.kind}`)
      seen.add(answer.kind)
    }
    // Both orders occurred, so each branch above was checked.
    expect([...seen].sort()).toEqual(['rejected', 'started'])
  })

  it('G5 order: the invalidation evidence is given only after its commit', async () => {
    for (const answer of ['unknown', 'unavailable'] as const) {
      const store = failingNextCommit(createMemoryToolLedgerStore<ContentBlock>(), answer)
      const authority = coordinator(store)
      const permit = await permitFor(authority, 'c1')
      store.arm()
      expect('failure' in (await authority.invalidate(invalidation('revoke-1')))).toBe(true)
      // The invalidation did not hold, and the caller was not told it did.
      expect(ok(await authority.consume(consumeWith(permit))).kind).toBe('started')
    }
  })

  it('G5 order: a resent invalidation returns its first evidence and moves the guard once', async () => {
    const authority = coordinator(createMemoryToolLedgerStore<ContentBlock>())
    const first = ok(await authority.invalidate(invalidation('revoke-1')))
    expect(ok(await authority.invalidate(invalidation('revoke-1')))).toEqual(first)
    const permit = await permitFor(authority, 'c1')
    expect(permit.guards).toMatchObject([{ owner: 'permissions', revision: '1' }])
  })

  it('G5 order: historical invalidation identity survives a later invalidation and coordinator reconstruction', async () => {
    const store = createMemoryToolLedgerStore<ContentBlock>()
    const authority = coordinator(store)
    const original = invalidation('revoke-1')
    const first = ok(await authority.invalidate(original))
    ok(await authority.invalidate(invalidation('revoke-2')))

    const restored = coordinator(store)
    const commits = store.commits
    expect(ok(await restored.invalidate(original))).toEqual(first)
    expect(
      await restored.invalidate({
        ...original,
        guard: { ...original.guard, resource: 'another-resource' },
      }),
    ).toEqual({ failure: { kind: 'conflict', operation: original.operation } })
    expect(store.commits).toBe(commits)
    const permit = await permitFor(restored, 'c1')
    expect(permit.guards).toMatchObject([{ owner: 'permissions', revision: '2' }])
    const other = coordinator(store, {
      guards: [{ ...permission, resource: 'another-resource' }],
    })
    expect((await permitFor(other, 'c2')).guards).toMatchObject([{ revision: '0' }])
  })

  it('G5 order: an applied invalidation with an unknown answer is recalled after reconstruction', async () => {
    const store = createMemoryToolLedgerStore<ContentBlock>()
    const authority = coordinator(store)
    store.injectCommit('unknown-applied')
    expect(await authority.invalidate(invalidation('revoke-1'))).toEqual({
      failure: { kind: 'commit-unknown', operation: operationId('revoke-1') },
    })
    const restored = coordinator(store)
    const commits = store.commits
    const recalled = ok(await restored.invalidate(invalidation('revoke-1')))
    expect(recalled.revision).toBe('1')
    expect(store.commits).toBe(commits)
    expect((await permitFor(restored, 'c1')).guards).toMatchObject([{ revision: '1' }])
  })

  it('G5 identity: invalidation binds every guard field and ignores property order and extra fields', async () => {
    const store = createMemoryToolLedgerStore<ContentBlock>()
    const authority = coordinator(store)
    const original = invalidation('revoke-1')
    const first = ok(await authority.invalidate(original))
    const changed: readonly StartGuard[] = [
      { ...original.guard, revision: '1' },
      { ...original.guard, evidence: { ...original.guard.evidence, digest: 'another-digest' } },
      { ...original.guard, scope: { kind: 'program', parent: callId('parent'), gate: 'open' } },
    ]
    const commits = store.commits
    for (const guard of changed)
      expect(await authority.invalidate({ ...original, guard })).toEqual({
        failure: { kind: 'conflict', operation: original.operation },
      })
    const reordered = {
      scope: original.guard.scope,
      evidence: {
        digest: original.guard.evidence.digest,
        revision: original.guard.evidence.revision,
        record: original.guard.evidence.record,
        owner: original.guard.evidence.owner,
      },
      revision: original.guard.revision,
      resource: original.guard.resource,
      owner: original.guard.owner,
      ignored: () => undefined,
    }
    expect(ok(await coordinator(store).invalidate({ ...original, guard: reordered }))).toEqual(
      first,
    )
    expect(store.commits).toBe(commits)
  })

  it('G5 identity: program guard identity includes every scope field', async () => {
    const store = createMemoryToolLedgerStore<ContentBlock>()
    const authority = coordinator(store)
    const scope = {
      kind: 'program',
      parent: callId('parent'),
      gate: 'closing',
      closure: operationId('close-1'),
      applies: 'all-children',
      cutoff: evidence('cutoff'),
    } satisfies StartGuard['scope']
    const original = {
      ...invalidation('revoke-1'),
      guard: { ...invalidation('revoke-1').guard, scope },
    }
    const first = ok(await authority.invalidate(original))
    const changed: readonly StartGuard['scope'][] = [
      { ...scope, parent: callId('another-parent') },
      { ...scope, gate: 'closed' },
      { ...scope, closure: operationId('close-2') },
      { ...scope, applies: 'foreground-and-unadmitted' },
      { ...scope, cutoff: { ...scope.cutoff, digest: 'another-cutoff' } },
    ]
    const commits = store.commits
    for (const other of changed)
      expect(
        await authority.invalidate({ ...original, guard: { ...original.guard, scope: other } }),
      ).toEqual({
        failure: { kind: 'conflict', operation: original.operation },
      })
    expect(ok(await authority.invalidate(original))).toEqual(first)
    expect(store.commits).toBe(commits)
  })

  it('G5 identity: malformed guard fields are invalid before any ledger access', async () => {
    const store = createMemoryToolLedgerStore<ContentBlock>()
    const authority = coordinator(store)
    const original = invalidation('revoke-1')
    const malformed = [
      { ...original.guard, revision: 1n },
      { ...original.guard, evidence: { ...original.guard.evidence, digest: () => 'invalid' } },
      { ...original.guard, scope: { kind: 'unknown' } },
      { ...original.guard, scope: { kind: 'program', parent: 'parent', gate: 'closing' } },
      {
        ...original.guard,
        scope: {
          kind: 'program',
          parent: 'parent',
          gate: 'closed',
          closure: 'close',
          applies: 'unknown',
          cutoff: evidence('cutoff'),
        },
      },
    ]
    for (const guard of malformed)
      expect(await authority.invalidate({ ...original, guard } as never)).toMatchObject({
        failure: { kind: 'invalid' },
      })
    expect(store.reads).toBe(0)
    expect(store.commits).toBe(0)
  })

  it('G5 identity: an exclusion alias binds its reason and survives coordinator reconstruction', async () => {
    const store = createMemoryToolLedgerStore<ContentBlock>()
    const authority = coordinator(store)
    const original = { ...callAccess('c1'), operation: operationId('op-a'), reason: 'first' }
    const first = ok(await authority.exclude(original))
    const alias = { ...original, operation: operationId('op-b'), reason: 'second' }
    expect(ok(await authority.exclude(alias))).toEqual(first)
    const restored = coordinator(store)
    const commits = store.commits
    expect(ok(await restored.exclude(alias))).toEqual(first)
    expect(await restored.exclude({ ...alias, reason: 'third' })).toEqual({
      failure: { kind: 'conflict', operation: alias.operation },
    })
    expect(store.commits).toBe(commits)
    expect(ok(await restored.exclude(original))).toEqual(first)
    const permit = await permitFor(restored, 'c1')
    expect(ok(await restored.consume(consumeWith(permit)))).toEqual({
      kind: 'rejected',
      reason: original.reason,
      exclusion: first,
    })
  })

  it('G5 exclude: an unknown applied alias commit is recalled with its input binding', async () => {
    const store = createMemoryToolLedgerStore<ContentBlock>()
    const authority = coordinator(store)
    const original = { ...callAccess('c1'), operation: operationId('op-a'), reason: 'first' }
    const first = ok(await authority.exclude(original))
    const alias = { ...original, operation: operationId('op-b'), reason: 'second' }
    store.injectCommit('unknown-applied')
    expect(await authority.exclude(alias)).toEqual({
      failure: { kind: 'commit-unknown', operation: alias.operation },
    })
    const restored = coordinator(store)
    const commits = store.commits
    expect(ok(await restored.exclude(alias))).toEqual(first)
    expect(await restored.exclude({ ...alias, reason: 'third' })).toEqual({
      failure: { kind: 'conflict', operation: alias.operation },
    })
    expect(store.commits).toBe(commits)
  })

  it('G5 inspect: an undecided start is not-started only after its outstanding permit was withdrawn', async () => {
    const authority = coordinator(createMemoryToolLedgerStore<ContentBlock>())
    const stale = await permitFor(authority, 'c1')
    const inspected = ok(await authority.inspect({ ...callAccess('c1'), start: startOf('c1') }))
    expect(inspected.kind).toBe('not-started')
    // The permit issued before the answer is excluded; a permit issued after it is not.
    expect(ok(await authority.consume(consumeWith(stale)))).toEqual(inspected)
    const fresh = await permitFor(authority, 'c1')
    expect(ok(await authority.consume(consumeWith(fresh))).kind).toBe('started')
  })

  it('G5 consume: a permit the coordinator did not issue is not accepted', async () => {
    const authority = coordinator(createMemoryToolLedgerStore<ContentBlock>())
    const permit = await permitFor(authority, 'c1')
    const forged = { ...permit, guards: [] }
    expect(await authority.consume(consumeWith(forged))).toEqual({
      failure: { kind: 'invalid', field: 'permit', reason: 'not-issued' },
    })
    const stale = { ...permit, guards: permit.guards.map(guard => ({ ...guard, revision: '7' })) }
    expect(await authority.consume(consumeWith(stale))).toMatchObject({
      failure: { reason: 'not-issued' },
    })
    expect(ok(await authority.consume(consumeWith(permit))).kind).toBe('started')
  })

  it('G5 consume: an unreadable acceptance ledger is unavailable, never an acceptance or a rejection', async () => {
    const store = createMemoryToolLedgerStore<ContentBlock>()
    const authority = coordinator(store)
    const permit = await permitFor(authority, 'c1')
    store.injectRead('unavailable')
    expect(await authority.consume(consumeWith(permit))).toMatchObject({
      failure: { kind: 'unavailable', dependency: 'start-ledger' },
    })
    store.injectRead('unavailable')
    expect(await authority.inspect({ ...callAccess('c1'), start: startOf('c1') })).toMatchObject({
      failure: { kind: 'unavailable', dependency: 'start-ledger' },
    })
    expect(ok(await authority.consume(consumeWith(permit))).kind).toBe('started')
  })

  it('G5 consume: a lost acceptance answer is unknown, and the acceptance is recalled after it', async () => {
    const store = failingNextCommit(createMemoryToolLedgerStore<ContentBlock>(), 'unknown')
    const authority = coordinator(store)
    const permit = await permitFor(authority, 'c1')
    store.arm()
    expect(ok(await authority.consume(consumeWith(permit))).kind).toBe('unknown')
    expect(ok(await authority.consume(consumeWith(permit))).kind).toBe('started')
  })

  it('G5 exclude: a call without an acceptance is excluded for good; an accepted one is in flight', async () => {
    const authority = coordinator(createMemoryToolLedgerStore<ContentBlock>())
    const permit = await permitFor(authority, 'c1')
    const exclusion = ok(
      await authority.exclude({
        ...callAccess('c1'),
        operation: operationId('op-x'),
        reason: 'withdrawn',
      }),
    )
    expect(ok(await authority.consume(consumeWith(permit)))).toEqual({
      kind: 'rejected',
      reason: 'withdrawn',
      exclusion,
    })
    expect(
      ok(
        await authority.exclude({
          ...callAccess('c1'),
          operation: operationId('op-x'),
          reason: 'withdrawn',
        }),
      ),
    ).toEqual(exclusion)
    expect(
      ok(
        await authority.exclude({
          ...callAccess('c1'),
          operation: operationId('op-another'),
          reason: 'another-reason',
        }),
      ),
    ).toEqual(exclusion)
    const other = await permitFor(authority, 'c2')
    ok(await authority.consume(consumeWith(other, 'c2')))
    expect(
      await authority.exclude({
        ...callAccess('c2'),
        operation: operationId('op-y'),
        reason: 'late',
      }),
    ).toEqual({ failure: { kind: 'conflict', operation: 'c2/start' } })
  })

  it('G5 identity: two calls with the same start operation text keep separate acceptances', async () => {
    const authority = coordinator(createMemoryToolLedgerStore<ContentBlock>())
    const shared = { ...startOf('c1'), operation: operationId('op/start') }
    const first = ok(
      await authority.prepare({ ...callAccess('c1'), start: shared, request: request() }),
    )
    ok(await authority.consume(consumeWith(first, 'c1')))
    const second = { ...shared, execution: { ...shared.execution, call: callId('c2') } }
    expect(ok(await authority.inspect({ ...callAccess('c2'), start: second })).kind).toBe(
      'not-started',
    )
  })
})

describe('G5 tenants and qualification', () => {
  it('G5 tenant: every operation denies a principal of another tenant before it reads', async () => {
    const store = createMemoryToolLedgerStore<ContentBlock>()
    const authority = coordinator(store)
    const permit = await permitFor(authority, 'c1')
    const reads = store.reads
    const foreign = { principal: principalB, tenant: tenantA as never, call: callId('c1') }
    const answers = [
      await authority.prepare({ ...foreign, start: startOf('c1'), request: request() }),
      await authority.consume({ ...foreign, permit, executorReceipt: evidence('capsule') }),
      await authority.inspect({ ...foreign, start: startOf('c1') }),
      await authority.exclude({ ...foreign, operation: operationId('op-x'), reason: 'r' }),
      await authority.invalidate({ ...invalidation('revoke-1'), principal: principalB }),
    ]
    expect(answers.map(answer => ('failure' in answer ? answer.failure.kind : 'ok'))).toEqual([
      'denied',
      'denied',
      'denied',
      'denied',
      'denied',
    ])
    expect(store.reads).toBe(reads)
    expect(
      await authority.inspect({
        principal: principalA,
        call: callId('c1'),
        start: startOf('c1'),
      } as never),
    ).toEqual({ failure: { kind: 'denied', action: 'start' } })
  })

  it('G5 tenant: an invalidation in one tenant does not touch the guard of the same name in another', async () => {
    const authority = coordinator(createMemoryToolLedgerStore<ContentBlock>())
    const accessB = { principal: principalB, tenant: tenantB as never, call: callId('c1') }
    const permitB = ok(
      await authority.prepare({ ...accessB, start: startOf('c1', tenantB), request: request() }),
    )
    ok(await authority.invalidate(invalidation('revoke-1')))
    expect(
      ok(
        await authority.consume({
          ...accessB,
          permit: permitB,
          executorReceipt: evidence('capsule'),
        }),
      ).kind,
    ).toBe('started')
  })

  it('G5 tenant: the same invalidation operation can bind a different guard in another tenant', async () => {
    const store = createMemoryToolLedgerStore<ContentBlock>()
    const authority = coordinator(store)
    const original = invalidation('revoke-1')
    const first = ok(await authority.invalidate(original))
    const other = {
      ...original,
      principal: principalB,
      tenant: tenantB as never,
      guard: { ...original.guard, resource: 'another-resource' },
    }
    const second = ok(await authority.invalidate(other))
    expect(second).not.toEqual(first)
    const restored = coordinator(store)
    const commits = store.commits
    expect(ok(await restored.invalidate(original))).toEqual(first)
    expect(ok(await restored.invalidate(other))).toEqual(second)
    expect(store.commits).toBe(commits)
  })

  it('G5 access: an unreadable qualification is unavailable, not an acceptance', async () => {
    const authority = coordinator(createMemoryToolLedgerStore<ContentBlock>(), {
      unavailable: 'directory down',
    })
    expect(
      await authority.prepare({ ...callAccess('c1'), start: startOf('c1'), request: request() }),
    ).toEqual({
      failure: { kind: 'unavailable', dependency: 'access-guard', diagnostic: 'directory down' },
    })
  })

  it('G5 construction: commit attempts outside their range are an assembly defect', () => {
    for (const commitAttempts of [0, 1.5])
      expect(() =>
        createLocalStartCoordinator({
          store: createMemoryToolLedgerStore<ContentBlock>(),
          access: access(),
          guardsOf: () => [],
          commitAttempts,
        }),
      ).toThrow('commitAttempts: range')
  })
})
