import { describe, expect, it } from 'vitest'
import type { LedgerRecord, ToolLedger, ToolLedgerStore } from '@omne-harness/tool'
import { createMemoryToolLedgerStore } from '@omne-harness/tool/testing'
import type { ToolState } from '@omne-harness/tool-contract'
import {
  admission,
  callId,
  dummyRequest,
  evidence,
  failure,
  functionDefinition,
  harness,
  interleaving,
  judged,
  ledgerOver,
  ok,
  operationId,
  principalA,
  principalB,
  putsExclusion,
  putsOperation,
  request,
  tenant,
  tenantA,
  tenantB,
  type Block,
  type Principal,
  type ScopeGrant,
  type TenantShape,
} from './runtime-values.ts'
import { queueKey } from './start-values.ts'

function settledTerminal(state: ToolState) {
  if (state.phase !== 'settled') throw new Error(`not settled: ${state.phase}`)
  return state.terminal
}

describe('10 boundary and qualification', () => {
  it('10 boundary: a missing or malformed tenant is denied without naming the call', async () => {
    const { runtime } = harness()
    const input = admission('call-1', 'op-1', dummyRequest())
    expect(await runtime.admit({ ...input, tenant: undefined as never })).toEqual({
      failure: { kind: 'denied', action: 'admit' },
    })
    const malformed = { ...tenantA, account: { name: 'AccountId', text: '' } }
    expect(await runtime.admit({ ...input, tenant: malformed as never })).toEqual({
      failure: { kind: 'denied', action: 'admit' },
    })
    // The halves are typed identities: an account half under another name is not a tenant.
    const misnamed = { ...tenantA, account: { name: 'OrganizationId', text: 'acc_a' } }
    expect(await runtime.admit({ ...input, tenant: misnamed as never })).toEqual({
      failure: { kind: 'denied', action: 'admit' },
    })
  })

  it('10 boundary: the access guard proves the tenant is minted; a forged object of the same shape is denied', async () => {
    // The ledger checks only the shape (SPEC 10); the guard, built with legal-identity in a
    // real host, recognises the minted values. Here the minted set stands in for that check.
    const { runtime, store } = harness({ minted: new Set([tenantA]) })
    const forgedTenant = tenant('org_a', 'acc_a')
    const input = admission('call-1', 'op-1', dummyRequest(), principalA, forgedTenant)
    expect(await runtime.admit(input)).toEqual({ failure: { kind: 'denied', action: 'admit' } })
    expect(store.commits).toBe(0)
    ok(await runtime.admit(admission('call-1', 'op-1', dummyRequest())))
  })

  it('10 boundary: a port that throws is unavailable with a diagnostic that carries no secret text', async () => {
    const secret = 'connect ECONNREFUSED postgres://user:pass@host'
    const guarded = harness({ accessThrows: secret })
    const denied = failure(await guarded.runtime.admit(admission('call-1', 'op-1', dummyRequest())))
    expect(denied).toMatchObject({ kind: 'unavailable', dependency: 'access-guard' })
    expect(JSON.stringify(denied)).not.toContain('pass')
    const unverified = harness({ sourceThrows: secret })
    const untrusted = failure(
      await unverified.runtime.admit(admission('call-1', 'op-1', dummyRequest())),
    )
    expect(untrusted).toEqual({
      kind: 'unavailable',
      dependency: 'source-guard',
      diagnostic: 'source-guard threw an exception; its message is not reported',
    })
    expect(unverified.store.commits).toBe(0)
    const throwing: ToolLedgerStore<Block> = {
      durability: 'none',
      read: () => Promise.reject(new Error(secret)),
      commit: () => Promise.reject(new Error(secret)),
    }
    const { reads, admissions } = ledgerOver(throwing)
    const unread = failure(
      await reads.lookup({ ...admission('call-1', 'op-1'), admission: operationId('op-1') }),
    )
    expect(unread).toMatchObject({ kind: 'unavailable', dependency: 'ledger-store' })
    expect(JSON.stringify(unread)).not.toContain('pass')
    const unadmitted = await admissions.admit(admission('call-1', 'op-1', dummyRequest()))
    expect(JSON.stringify(unadmitted)).not.toContain('pass')
  })

  it('10 boundary: a principal of another tenant is denied by every operation and learns nothing', async () => {
    const { runtime } = harness()
    const mine = admission('call-1', 'op-1', dummyRequest())
    ok(await runtime.admit(mine))
    const theirs = { principal: principalB, tenant: tenantA, call: callId('call-1') }
    const probes = {
      admit: runtime.admit({ ...theirs, operation: operationId('op-9'), request: dummyRequest() }),
      lookup: runtime.lookup({ ...theirs, admission: operationId('op-1') }),
      queryOperation: runtime.queryOperation({ ...theirs, operation: operationId('op-1') }),
      readResult: runtime.readResult({ ...theirs, result: 'v1' as never, after: null }),
      releaseDelivery: runtime.releaseDelivery({
        ...theirs,
        operation: operationId('op-2'),
        result: 'v1' as never,
        delivery: 'd1' as never,
        consumer: dummyRequest().consumer,
        evidence: { kind: 'retained', custody: evidence('kept', 'consumer') },
      }),
      account: runtime.account(theirs),
    }
    // Each operation names its own resource action, so a guard can grant them separately.
    const actions: Record<keyof typeof probes, string> = {
      admit: 'admit',
      lookup: 'lookup',
      queryOperation: 'query-operation',
      readResult: 'read-result',
      releaseDelivery: 'release-delivery',
      account: 'account',
    }
    for (const [name, probe] of Object.entries(probes)) {
      expect([name, await probe]).toEqual([
        name,
        { failure: { kind: 'denied', action: actions[name as keyof typeof probes] } },
      ])
    }
    // The same call name under the other tenant does not exist there: nothing of tenant A shows.
    const other = { principal: principalB, tenant: tenantB, call: callId('call-1') }
    expect(await runtime.lookup({ ...other, admission: operationId('op-1') })).toEqual({
      ok: { kind: 'not-accepted', operation: 'op-1' },
    })
    expect(await runtime.queryOperation({ ...other, operation: operationId('op-1') })).toEqual({
      ok: { kind: 'not-committed' },
    })
  })

  it('10 boundary: a malformed identity or request is invalid and nothing is admitted', async () => {
    const { runtime, store } = harness()
    expect(
      await runtime.admit({ ...admission('call-1', 'op-1'), call: 'has space' as never }),
    ).toEqual({
      failure: { kind: 'invalid', field: 'call', reason: 'character' },
    })
    const body = {
      ...request(),
      limits: { concurrency: 0, foregroundMs: null, backgroundAfterMs: null },
    }
    expect(await runtime.admit(admission('call-1', 'op-1', body))).toEqual({
      failure: { kind: 'invalid', field: 'request.limits.concurrency', reason: 'range' },
    })
    expect(store.commits).toBe(0)
  })

  it('10 boundary: a forged source is denied and an unavailable guard blocks the admission', async () => {
    const forged = harness({ forged: ['entry'] })
    expect(await forged.runtime.admit(admission('call-1', 'op-1', dummyRequest()))).toEqual({
      failure: { kind: 'denied', action: 'admit' },
    })
    expect(forged.store.commits).toBe(0)
    const blind = harness({ accessUnavailable: 'directory down' })
    expect(await blind.runtime.admit(admission('call-1', 'op-1', dummyRequest()))).toEqual({
      failure: { kind: 'unavailable', dependency: 'access-guard', diagnostic: 'directory down' },
    })
  })

  it('10 boundary: admission verifies that the scope owner granted the key to this tenant and caller', async () => {
    const scope = request().scope
    const granted = (overrides: Partial<ScopeGrant> = {}) =>
      new Map([
        [
          scope.grant.record,
          { owner: scope.owner, key: scope.key, tenant: tenantA, subject: 'alice', ...overrides },
        ],
      ])
    const admit = (grants: ReadonlyMap<string, ScopeGrant>) => {
      const guarded = harness({ grants })
      return guarded.runtime.admit(admission('call-1', 'op-1', request())).then(answer => ({
        answer,
        commits: guarded.store.commits,
      }))
    }
    const denied = { failure: { kind: 'denied', action: 'admit' } }
    const accepted = await admit(granted())
    expect(ok(accepted.answer).state.phase).toBe('accepted')
    // A grant that is missing, or issued for another key, owner, tenant or caller, admits nothing.
    for (const grants of [
      new Map<string, ScopeGrant>(),
      granted({ key: 'scope-2' }),
      granted({ owner: 'other-owner' }),
      granted({ tenant: tenantB }),
      granted({ subject: 'carol' }),
    ]) {
      const refused = await admit(grants)
      expect(refused).toEqual({ answer: denied, commits: 0 })
    }
  })

  it('10 boundary: a scope whose owner has no declared verifier is denied like a missing grant', async () => {
    const none = harness({ grantOwners: [] })
    expect(await none.runtime.admit(admission('call-1', 'op-1', request()))).toEqual({
      failure: { kind: 'denied', action: 'admit' },
    })
    expect(none.store.commits).toBe(0)
    // Another owner is not covered by the declared one.
    const other = request({ scope: { ...request().scope, owner: 'undeclared-owner' } })
    const declared = harness()
    expect(await declared.runtime.admit(admission('call-2', 'op-2', other))).toEqual({
      failure: { kind: 'denied', action: 'admit' },
    })
    expect(declared.store.commits).toBe(0)
    ok(await declared.runtime.admit(admission('call-3', 'op-3', request())))
  })

  it('10 boundary: a grant source that cannot be read is unavailable and admits nothing', async () => {
    const unread = harness({ grantUnavailable: 'grant registry down' })
    expect(await unread.runtime.admit(admission('call-1', 'op-1', request()))).toEqual({
      failure: {
        kind: 'unavailable',
        dependency: 'grant-guard',
        diagnostic: 'grant registry down',
      },
    })
    const secret = 'connect ECONNREFUSED postgres://user:pass@host'
    const thrown = harness({ grantThrows: secret })
    expect(await thrown.runtime.admit(admission('call-1', 'op-1', request()))).toEqual({
      failure: {
        kind: 'unavailable',
        dependency: 'grant-guard',
        diagnostic: 'grant-guard threw an exception; its message is not reported',
      },
    })
    expect(unread.store.commits + thrown.store.commits).toBe(0)
  })

  it('10 boundary: the same scope owner and key in two tenants never share a queue', async () => {
    const { runtime, store } = harness()
    ok(await runtime.admit(admission('call-1', 'op-1', request(), principalA, tenantA)))
    ok(await runtime.admit(admission('call-1', 'op-1', request(), principalB, tenantB)))
    const ordinals = async (within: TenantShape) => {
      const read = await store.read({ kind: 'queue', tenant: within as never, key: queueKey() })
      if (read.kind !== 'complete') throw new Error('the queue domain is unreadable')
      return read.records.flatMap(record =>
        record.kind === 'queue-entry' ? [record.entry.ordinal] : [],
      )
    }
    // Each tenant's first call is first in its own queue, though the key texts are equal.
    expect(await ordinals(tenantA)).toEqual(['1'])
    expect(await ordinals(tenantB)).toEqual(['1'])
  })

  it('10 boundary: an admission needs only the admit permission, not the query permission', async () => {
    const { runtime } = harness({ deniedActions: ['query-operation'] })
    const first = ok(await runtime.admit(admission('call-1', 'op-1', dummyRequest())))
    expect(first.recovered).toBe(false)
    const again = ok(await runtime.admit(admission('call-1', 'op-1', dummyRequest())))
    expect(again).toEqual({ state: first.state, recovered: true })
    expect(
      await runtime.queryOperation({
        ...admission('call-1', 'op-1'),
        operation: operationId('op-1'),
      }),
    ).toEqual({ failure: { kind: 'denied', action: 'query-operation' } })
  })

  it('10 boundary: two tenants with the same call identity get different evidence of every kind', async () => {
    const { runtime, store } = harness()
    const evidenceOf = async (principal: Principal, within: TenantShape) => {
      const access = { principal, tenant: within, call: callId('call-1') }
      const admitted = ok(
        await runtime.admit(admission('call-1', 'op-1', dummyRequest(), principal, within)),
      )
      const page = ok(await runtime.readResult({ ...access, result: 'v1' as never, after: null }))
      const receipt = ok(
        await runtime.queryOperation({ ...access, operation: operationId('op-1') }),
      )
      const released = ok(
        await runtime.releaseDelivery({
          ...access,
          operation: operationId('op-2'),
          result: 'v1' as never,
          delivery: 'd1' as never,
          consumer: dummyRequest().consumer,
          evidence: { kind: 'retained', custody: evidence('kept', 'consumer') },
        }),
      )
      const read = await store.read({
        kind: 'call',
        tenant: within as never,
        call: callId('call-1'),
      })
      const account = read.kind === 'complete' ? read.records.find(r => r.kind === 'account') : null
      return {
        state: admitted.state.source,
        result: page.source,
        operation: receipt.kind === 'committed' ? receipt.receipt : null,
        delivery: released.kind === 'released' ? released.evidence : null,
        account: account?.kind === 'account' ? account.account.source : null,
      }
    }
    const a = await evidenceOf(principalA, tenantA)
    const b = await evidenceOf(principalB, tenantB)
    for (const kind of ['state', 'result', 'operation', 'delivery', 'account'] as const) {
      const left = a[kind]
      const right = b[kind]
      expect([kind, left === null || right === null]).toEqual([kind, false])
      expect([kind, left?.record === right?.record]).toEqual([kind, false])
      expect([kind, left?.digest === right?.digest]).toEqual([kind, false])
      expect([kind, left?.record]).toEqual([
        kind,
        expect.stringContaining('"organization":"org_a"'),
      ])
      expect([kind, right?.record]).toEqual([
        kind,
        expect.stringContaining('"organization":"org_b"'),
      ])
    }
  })
})

describe('11 operation idempotency (P01)', () => {
  it('11 idempotency: the same call, operation and input answers the original result once more', async () => {
    const { runtime, store } = harness()
    const first = ok(await runtime.admit(admission('call-1', 'op-1', dummyRequest())))
    expect(first.recovered).toBe(false)
    const again = ok(await runtime.admit(admission('call-1', 'op-1', dummyRequest())))
    expect(again).toEqual({ state: first.state, recovered: true })
    expect(store.commits).toBe(1)
  })

  it('11 idempotency: the same operation with another input is a conflict', async () => {
    const { runtime } = harness()
    ok(await runtime.admit(admission('call-1', 'op-1', dummyRequest())))
    const changed = dummyRequest({
      consumer: { ...dummyRequest().consumer, position: 'position-2' },
    })
    expect(await runtime.admit(admission('call-1', 'op-1', changed))).toEqual({
      failure: { kind: 'conflict', operation: 'op-1' },
    })
  })

  it('11 idempotency: a second admission of an admitted call is stale-revision, not a second call', async () => {
    const { runtime, store } = harness()
    const first = ok(await runtime.admit(admission('call-1', 'op-1', dummyRequest())))
    expect(await runtime.admit(admission('call-1', 'op-2', dummyRequest()))).toEqual({
      failure: { kind: 'stale-revision', current: first.state.revision },
    })
    expect(store.commits).toBe(1)
  })

  it('11 idempotency: a write context whose expected revision is not current is stale-revision before anything else', async () => {
    const { ledger, runtime } = harness()
    const first = ok(await runtime.admit(admission('call-1', 'op-1', dummyRequest())))
    const { commands } = ledger
    const context = {
      principal: principalA,
      tenant: tenantA,
      call: callId('call-1'),
      instance: 'instance-1' as never,
      generation: 'g1',
      operation: operationId('op-3'),
    }
    expect(
      await commands.preserveProcess({ ...context, blocks: [], expected: '0' as never }),
    ).toEqual({
      failure: { kind: 'stale-revision', current: first.state.revision },
    })
    expect(
      await commands.preserveProcess({ ...context, blocks: [], expected: first.state.revision }),
    ).toMatchObject({
      failure: { kind: 'unsupported', reason: expect.stringContaining('preserveProcess') },
    })
  })

  it('11 idempotency: a call that was never admitted has state revision 0, however often it was fenced', async () => {
    const { ledger, runtime, store } = harness()
    const query = { ...admission('call-1', 'op-1'), operation: operationId('op-1') }
    expect(await runtime.queryOperation(query)).toEqual({ ok: { kind: 'not-committed' } })
    expect(await runtime.queryOperation(query)).toEqual({ ok: { kind: 'not-committed' } })
    expect(store.commits).toBe(2)
    const context = {
      principal: principalA,
      tenant: tenantA,
      call: callId('call-1'),
      instance: 'instance-1' as never,
      generation: 'g1',
      operation: operationId('op-3'),
    }
    expect(
      await ledger.commands.preserveProcess({ ...context, blocks: [], expected: '0' as never }),
    ).toMatchObject({
      failure: { kind: 'unsupported', reason: expect.stringContaining('preserveProcess') },
    })
    expect(
      await ledger.commands.preserveProcess({ ...context, blocks: [], expected: '2' as never }),
    ).toEqual({
      failure: { kind: 'stale-revision', current: '0' },
    })
  })

  it('11 idempotency: an unknown commit is reported, then the original is recognised and not admitted twice', async () => {
    for (const fault of ['unknown-applied', 'throw-applied'] as const) {
      const { runtime, store } = harness()
      store.injectCommit(fault)
      expect(await runtime.admit(admission('call-1', 'op-1', dummyRequest()))).toEqual({
        failure: { kind: 'commit-unknown', operation: 'op-1' },
      })
      const resolved = ok(
        await runtime.queryOperation({
          ...admission('call-1', 'op-1'),
          operation: operationId('op-1'),
        }),
      )
      expect(resolved.kind).toBe('committed')
      const recalled = ok(await runtime.admit(admission('call-1', 'op-1', dummyRequest())))
      expect(recalled.recovered).toBe(true)
      expect(settledTerminal(recalled.state).kind).toBe('unavailable')
      expect(store.commits).toBe(1)
    }
  })

  it('11 idempotency: an unknown commit that was dropped is not committed, and the resend admits once', async () => {
    const { runtime, store } = harness()
    store.injectCommit('unknown-dropped')
    expect(await runtime.admit(admission('call-1', 'op-1', dummyRequest()))).toEqual({
      failure: { kind: 'commit-unknown', operation: 'op-1' },
    })
    expect(
      await runtime.queryOperation({
        ...admission('call-1', 'op-1'),
        operation: operationId('op-1'),
      }),
    ).toEqual({ ok: { kind: 'not-committed' } })
    const admitted = ok(await runtime.admit(admission('call-1', 'op-1', dummyRequest())))
    expect(admitted.recovered).toBe(false)
    // The dropped attempt, the exclusion fence of the query, and the admission.
    expect(store.commits).toBe(3)
  })

  it('11 idempotency: not-committed excludes an in-flight commit that lands later', async () => {
    const { runtime, store } = harness()
    const query = { ...admission('call-1', 'op-1'), operation: operationId('op-1') }
    store.injectCommit('unknown-delayed')
    expect(await runtime.admit(admission('call-1', 'op-1', dummyRequest()))).toEqual({
      failure: { kind: 'commit-unknown', operation: 'op-1' },
    })
    expect(await runtime.queryOperation(query)).toEqual({ ok: { kind: 'not-committed' } })
    // The held commit expected the revision that the fence advanced, so it cannot land.
    expect(store.landDelayed()).toEqual([{ kind: 'conflict' }])
    expect(await runtime.queryOperation(query)).toEqual({ ok: { kind: 'not-committed' } })
    const admitted = ok(await runtime.admit(admission('call-1', 'op-1', dummyRequest())))
    expect(admitted.recovered).toBe(false)
    expect(await runtime.queryOperation(query)).toMatchObject({ ok: { kind: 'committed' } })
  })

  it('11 idempotency: a commit that lands before the fence is recognised, not excluded', async () => {
    const memory = harness().store
    memory.injectCommit('unknown-delayed')
    // The held commit lands just before the fence commit, as a slow store would apply it.
    const racing: ToolLedgerStore<Block> = {
      durability: 'none',
      read: domain => memory.read(domain),
      commit: input => {
        if (putsExclusion(input)) memory.landDelayed()
        return memory.commit(input)
      },
    }
    const { admissions, reads } = ledgerOver(racing)
    expect(await admissions.admit(admission('call-1', 'op-1', dummyRequest()))).toEqual({
      failure: { kind: 'commit-unknown', operation: 'op-1' },
    })
    const query = { ...admission('call-1', 'op-1'), operation: operationId('op-1') }
    expect(await reads.operation(query)).toMatchObject({ ok: { kind: 'committed' } })
    const lookup = { ...admission('call-1', 'op-1'), admission: operationId('op-1') }
    expect(await reads.lookup(lookup)).toMatchObject({ ok: { kind: 'found' } })
  })

  it('11 idempotency: a fence whose outcome is unknown or unavailable never answers the negative', async () => {
    const { runtime, store } = harness()
    const query = { ...admission('call-1', 'op-1'), operation: operationId('op-1') }
    const lookup = { ...admission('call-1', 'op-1'), admission: operationId('op-1') }
    store.injectCommit('unknown-dropped')
    expect(await runtime.queryOperation(query)).toEqual({ ok: { kind: 'unknown' } })
    store.injectCommit('unknown-dropped')
    expect(await runtime.lookup(lookup)).toMatchObject({
      failure: { kind: 'unavailable', dependency: 'ledger-store' },
    })
    store.injectCommit('unavailable')
    expect(await runtime.queryOperation(query)).toEqual({
      failure: { kind: 'unavailable', dependency: 'ledger-store', diagnostic: 'injected' },
    })
    store.injectCommit('unavailable')
    expect(await runtime.lookup(lookup)).toMatchObject({
      failure: { kind: 'unavailable', dependency: 'ledger-store' },
    })
  })

  it('11 idempotency: a fence does not make the holder of the current state stale', async () => {
    const { ledger, runtime } = harness()
    const first = ok(await runtime.admit(admission('call-1', 'op-1', dummyRequest())))
    // A negative lookup fences the domain; the state and its revision stay as they were.
    expect(
      await runtime.lookup({ ...admission('call-1', 'op-1'), admission: operationId('op-9') }),
    ).toEqual({ ok: { kind: 'not-accepted', operation: 'op-9' } })
    const found = ok(
      await runtime.lookup({ ...admission('call-1', 'op-1'), admission: operationId('op-1') }),
    )
    expect(found).toEqual({ kind: 'found', state: first.state })
    const context = {
      principal: principalA,
      tenant: tenantA,
      call: callId('call-1'),
      instance: 'instance-1' as never,
      generation: 'g1',
      operation: operationId('op-3'),
      expected: first.state.revision,
    }
    expect(await ledger.commands.preserveProcess({ ...context, blocks: [] })).toMatchObject({
      failure: { kind: 'unsupported', reason: expect.stringContaining('preserveProcess') },
    })
    expect(await runtime.admit(admission('call-1', 'op-2', dummyRequest()))).toEqual({
      failure: { kind: 'stale-revision', current: first.state.revision },
    })
  })

  it('11 idempotency: concurrent first admissions admit once and the duplicate is recognised', async () => {
    const same = harness()
    const pair = await Promise.all([
      same.runtime.admit(admission('call-1', 'op-1', dummyRequest())),
      same.runtime.admit(admission('call-1', 'op-1', dummyRequest())),
    ])
    const [left, right] = pair.map(ok)
    expect(left?.state).toEqual(right?.state)
    expect(pair.map(outcome => ok(outcome).recovered).sort()).toEqual([false, true])
    const other = harness()
    const raced = await Promise.all([
      other.runtime.admit(admission('call-1', 'op-1', dummyRequest())),
      other.runtime.admit(admission('call-1', 'op-2', dummyRequest())),
    ])
    const admitted = raced.filter(outcome => 'ok' in outcome)
    expect(admitted).toHaveLength(1)
    expect(raced.filter(outcome => 'failure' in outcome)).toEqual([
      { failure: { kind: 'stale-revision', current: ok(admitted[0] ?? raced[0]).state.revision } },
    ])
  })

  it('11 idempotency: revision conflicts are retried up to the configured attempts, then unavailable', async () => {
    const once = harness({ ledgerCommitAttempts: 1 })
    once.store.injectCommit('conflict')
    expect(await once.runtime.admit(admission('call-1', 'op-1', dummyRequest()))).toEqual({
      failure: {
        kind: 'unavailable',
        dependency: 'ledger-store',
        diagnostic: '1 revision conflicts in a row',
      },
    })
    const twice = harness({ ledgerCommitAttempts: 2 })
    twice.store.injectCommit('conflict')
    expect(
      ok(await twice.runtime.admit(admission('call-1', 'op-1', dummyRequest()))).recovered,
    ).toBe(false)
    expect(twice.store.commits).toBe(2)
  })

  it('11 idempotency: a read failure of the store is unavailable, never a missing call', async () => {
    const { runtime, store } = harness()
    ok(await runtime.admit(admission('call-1', 'op-1', dummyRequest())))
    store.injectRead('unavailable')
    expect(
      await runtime.lookup({ ...admission('call-1', 'op-1'), admission: operationId('op-1') }),
    ).toEqual({
      failure: { kind: 'unavailable', dependency: 'ledger-store', diagnostic: 'injected' },
    })
  })
})

describe('12 logical terminals (P02)', () => {
  it('12 logical terminal: a known-unavailable tool settles as unavailable without parsing arguments or touching a port', async () => {
    const { runtime, spies } = harness()
    const body = dummyRequest({
      arguments: { original: '{"path":', effective: 'not json at all', complete: false },
    })
    const admitted = ok(await runtime.admit(admission('call-1', 'op-1', body)))
    const state = judged(admitted.state)
    expect(settledTerminal(state)).toEqual({
      kind: 'unavailable',
      reason: 'dependency-unavailable:file-system',
    })
    expect(state).toMatchObject({
      phase: 'settled',
      relation: 'foreground',
      execution: { kind: 'not-started' },
      effect: { kind: 'not-started' },
      foreground: { kind: 'final', result: 'v1' },
      delivery: { kind: 'pending', delivery: 'd1', consumer: body.consumer },
      queue: { kind: 'none' },
      timing: { kind: 'closed', accumulatedMs: '0' },
    })
    expect([...spies.calls.keys()]).toEqual([])
  })

  it('12 logical terminal: one commit holds the call, the operation, the result, the account and the deliver task', async () => {
    const { runtime, store } = harness()
    ok(await runtime.admit(admission('call-1', 'op-1', dummyRequest())))
    expect(store.commits).toBe(1)
    const read = await store.read({
      kind: 'call',
      tenant: tenantA as never,
      call: callId('call-1'),
    })
    if (read.kind !== 'complete') throw new Error('read failed')
    expect(read.revision).toBe('1')
    expect(read.records.map(record => record.kind).sort()).toEqual([
      'account',
      'call',
      'operation',
      'result',
      'task',
    ])
    expect(read.records.find(record => record.kind === 'task')).toEqual({
      kind: 'task',
      task: {
        kind: 'deliver',
        operation: 'op-1',
        state: 'pending',
        diagnostic: null,
        result: 'v1',
        delivery: 'd1',
        consumer: dummyRequest().consumer,
      },
    })
  })

  it('12 logical terminal: complete but illegal arguments settle as an arguments failure', async () => {
    const { runtime, spies } = harness()
    const body = request({
      arguments: { original: '{"path":"a","path":"b"}', effective: '{"path":"b"}', complete: true },
    })
    const admitted = ok(await runtime.admit(admission('call-1', 'op-1', body)))
    const state = judged(admitted.state)
    expect(settledTerminal(state)).toEqual({
      kind: 'failed',
      cause: 'arguments',
      diagnostic: 'original: duplicate-key',
    })
    expect(state.execution).toEqual({ kind: 'not-started' })
    expect([...spies.calls.keys()]).toEqual([])
  })

  it('12 logical terminal: a truncated effective text fails even when the original parses', async () => {
    const { runtime } = harness()
    const body = request({
      arguments: { original: '{"path":"a"}', effective: '{"path":"a', complete: true },
    })
    const admitted = ok(await runtime.admit(admission('call-1', 'op-1', body)))
    expect(settledTerminal(admitted.state)).toEqual({
      kind: 'failed',
      cause: 'arguments',
      diagnostic: 'effective: syntax:truncated',
    })
  })

  it('12 logical terminal: incomplete arguments are not parsed and not admitted', async () => {
    const { runtime, store } = harness()
    const body = request({ arguments: { original: '{', effective: '{', complete: false } })
    expect(await runtime.admit(admission('call-1', 'op-1', body))).toEqual({
      failure: { kind: 'invalid', field: 'request.arguments.complete', reason: 'incomplete' },
    })
    expect(store.commits).toBe(0)
  })

  it('12 logical terminal: a well-formed call to an available tool is accepted with its queue task, and nothing runs at admit', async () => {
    const { runtime, ledger, store, spies, host } = harness()
    const admitted = ok(await runtime.admit(admission('call-1', 'op-1', request())))
    expect(admitted.recovered).toBe(false)
    expect(judged(admitted.state)).toMatchObject({
      phase: 'accepted',
      relation: 'foreground',
      execution: { kind: 'not-started' },
      effect: { kind: 'not-started' },
      queue: { kind: 'none' },
      delivery: null,
    })
    const recovery = ok(await ledger.commands.loadRecovery(admission('call-1', 'op-1')))
    expect(recovery.tasks.map(task => task.kind)).toEqual(['queue'])
    // The admission commit and the queue step that gives the call its ordinal.
    expect(store.commits).toBe(2)
    expect([...spies.calls.keys()]).toEqual([])
    expect(host.scheduled.map(wake => wake.call)).toEqual(['call-1'])
  })
})

describe('13 invocation permission', () => {
  it('13 permission: a script call to a tool without programmable permission is unsupported and not admitted', async () => {
    const { runtime, store } = harness()
    const script = request({ invocation: { kind: 'programmatic', source: evidence('script') } })
    expect(await runtime.admit(admission('call-1', 'op-1', script))).toEqual({
      failure: {
        kind: 'unsupported',
        adoption: functionDefinition().adoption,
        reason: 'the definition does not permit programmatic invocation',
      },
    })
    expect(store.commits).toBe(0)
    expect(
      await runtime.lookup({ ...admission('call-1', 'op-1'), admission: operationId('op-1') }),
    ).toEqual({ ok: { kind: 'not-accepted', operation: 'op-1' } })
  })

  it('13 permission: a script call to a programmable tool passes the permission check', async () => {
    const { runtime } = harness()
    const definition = functionDefinition({ programmable: true })
    const script = request({
      availability: { kind: 'available', definition, executor: { ...definition.adoption } },
      invocation: { kind: 'programmatic', source: evidence('script') },
      arguments: { original: '{', effective: '{', complete: true },
    })
    const admitted = ok(await runtime.admit(admission('call-1', 'op-1', script)))
    expect(settledTerminal(admitted.state).kind).toBe('failed')
  })

  it('13 permission: a dummy answers a script call with unavailable, whatever its permission', async () => {
    const { runtime } = harness()
    const script = dummyRequest({
      invocation: { kind: 'programmatic', source: evidence('script') },
    })
    const admitted = ok(await runtime.admit(admission('call-1', 'op-1', script)))
    expect(settledTerminal(admitted.state).kind).toBe('unavailable')
  })

  it('13 permission: a background start needs the author permission, for a logical terminal too', async () => {
    const { runtime, store } = harness()
    const refused = {
      failure: { kind: 'invalid', field: 'request.mode', reason: 'background-not-allowed' },
    }
    expect(
      await runtime.admit(admission('call-1', 'op-1', request({ mode: 'background' }))),
    ).toEqual(refused)
    // A dummy and an argument failure would settle without running; the request is still one
    // that the definition does not permit, so it gets the same refusal and nothing is admitted.
    expect(
      await runtime.admit(admission('call-1', 'op-1', dummyRequest({ mode: 'background' }))),
    ).toEqual(refused)
    const broken = request({
      mode: 'background',
      arguments: { original: '{', effective: '{', complete: true },
    })
    expect(await runtime.admit(admission('call-1', 'op-1', broken))).toEqual(refused)
    expect(store.commits).toBe(0)
  })

  it('13 permission: a call launched in the background holds a placeholder whose source is the launch', async () => {
    const { runtime } = harness()
    const definition = functionDefinition({ backgroundAllowed: true })
    const launched = request({
      mode: 'background',
      availability: { kind: 'available', definition, executor: { ...definition.adoption } },
    })
    const admitted = ok(await runtime.admit(admission('call-1', 'op-1', launched)))
    expect(judged(admitted.state)).toMatchObject({
      relation: 'background',
      foreground: { kind: 'background', call: 'call-1', source: { kind: 'launched' } },
    })
  })
})

const EXCLUDED = {
  kind: 'unavailable',
  dependency: 'ledger-store',
  diagnostic: 'operation op-1 was excluded by a negative answer; resubmit with the same identity',
}

const releaseOf = (operation: string) => ({
  ...admission('call-1', operation),
  result: 'v1' as never,
  delivery: 'd1' as never,
  consumer: dummyRequest().consumer,
  evidence: { kind: 'retained', custody: evidence('kept', 'consumer') } as const,
})

async function recordsOf(store: ToolLedgerStore<Block>): Promise<readonly LedgerRecord<Block>[]> {
  const read = await store.read({ kind: 'call', tenant: tenantA as never, call: callId('call-1') })
  if (read.kind !== 'complete') throw new Error('read failed')
  return read.records
}

/**
 * An admission of op-1 whose commit is overtaken by a negative queryOperation of op-1: the
 * admission read the domain, the query fenced it, the admission's commit conflicted. The
 * admission must then stop, because its negative answer was already given (P01).
 */
async function overtakenAdmission(body = dummyRequest()) {
  const memory = createMemoryToolLedgerStore<Block>()
  const query = { ...admission('call-1', 'op-1'), operation: operationId('op-1') }
  let negative: unknown = null
  const ledger: ToolLedger<Principal, Block> = ledgerOver(
    interleaving(memory, putsOperation('op-1'), async () => {
      negative = await ledger.reads.operation(query)
    }),
  )
  const stopped = await ledger.admissions.admit(admission('call-1', 'op-1', body))
  expect(stopped).toEqual({ failure: EXCLUDED })
  expect(negative).toEqual({ ok: { kind: 'not-committed' } })
  expect(await ledger.reads.operation(query)).toEqual({ ok: { kind: 'not-committed' } })
  // The fence of the first query, the overtaken commit, and the fence of the second query.
  expect(memory.commits).toBe(3)
  return { memory, ledger, query }
}

describe('14 exclusion fence (P01)', () => {
  it('14 exclusion: a negative answer during an in-flight admission stops it, and the same identity is then admitted once', async () => {
    const { memory, ledger, query } = await overtakenAdmission()
    const admitted = ok(await ledger.admissions.admit(admission('call-1', 'op-1', dummyRequest())))
    expect(admitted.recovered).toBe(false)
    expect(await ledger.reads.operation(query)).toMatchObject({ ok: { kind: 'committed' } })
    expect(memory.commits).toBe(4)
    const again = ok(await ledger.admissions.admit(admission('call-1', 'op-1', dummyRequest())))
    expect(again).toEqual({ state: admitted.state, recovered: true })
  })

  it('14 exclusion: after the negative, the same identity with another input is a first admission, not a conflict', async () => {
    const { ledger } = await overtakenAdmission()
    const changed = dummyRequest({
      consumer: { ...dummyRequest().consumer, position: 'position-2' },
    })
    const admitted = ok(await ledger.admissions.admit(admission('call-1', 'op-1', changed)))
    expect(admitted.recovered).toBe(false)
    expect(settledTerminal(admitted.state).kind).toBe('unavailable')
  })

  it('14 exclusion: an operation that committed before the fence is recalled, not excluded', async () => {
    // The retrying release of op-2 re-reads a domain where op-2 committed and a lookup fenced
    // op-2 after that (the admission is op-1, so op-2 is "not accepted"): recall wins.
    const memory = createMemoryToolLedgerStore<Block>()
    const ledger: ToolLedger<Principal, Block> = ledgerOver(
      interleaving(memory, putsOperation('op-2'), async () => {
        ok(await ledger.commands.releaseDelivery(releaseOf('op-2')))
        expect(
          await ledger.reads.lookup({
            ...admission('call-1', 'op-2'),
            admission: operationId('op-2'),
          }),
        ).toEqual({ ok: { kind: 'not-accepted', operation: 'op-2' } })
      }),
    )
    ok(await ledger.admissions.admit(admission('call-1', 'op-1', dummyRequest())))
    const released = ok(await ledger.commands.releaseDelivery(releaseOf('op-2')))
    expect(released.kind).toBe('released')
    const records = await recordsOf(memory)
    expect(records.filter(record => record.kind === 'exclusion')).toEqual([
      { kind: 'exclusion', exclusion: { operation: 'op-2', revision: '3' } },
    ])
    expect(memory.commits).toBe(4)
  })

  it('14 exclusion: a later negative replaces the fence; a command that read the latest fence is not excluded by it', async () => {
    const memory = createMemoryToolLedgerStore<Block>()
    const query = { ...admission('call-1', 'op-1'), operation: operationId('op-1') }
    const ledger: ToolLedger<Principal, Block> = ledgerOver(
      interleaving(memory, putsOperation('op-1'), async () => {
        expect(await ledger.reads.operation(query)).toEqual({ ok: { kind: 'not-committed' } })
      }),
    )
    expect(await ledger.reads.operation(query)).toEqual({ ok: { kind: 'not-committed' } })
    expect(await recordsOf(memory)).toEqual([
      { kind: 'exclusion', exclusion: { operation: 'op-1', revision: '1' } },
    ])
    // Read after the first fence, overtaken by the second: excluded by the newer fence.
    expect(await ledger.admissions.admit(admission('call-1', 'op-1', dummyRequest()))).toEqual({
      failure: EXCLUDED,
    })
    expect(await recordsOf(memory)).toEqual([
      { kind: 'exclusion', exclusion: { operation: 'op-1', revision: '2' } },
    ])
    // Read after the second fence, then a conflict without a newer fence: admitted on the retry.
    memory.injectCommit('conflict')
    const admitted = ok(await ledger.admissions.admit(admission('call-1', 'op-1', dummyRequest())))
    expect(admitted.recovered).toBe(false)
    expect(admitted.state.revision).toBe('3')
  })

  it('14 exclusion: the admitting commit removes the fence, and the next same submission is recalled', async () => {
    const { runtime, store } = harness()
    const query = { ...admission('call-1', 'op-1'), operation: operationId('op-1') }
    expect(await runtime.queryOperation(query)).toEqual({ ok: { kind: 'not-committed' } })
    expect(await recordsOf(store)).toEqual([
      { kind: 'exclusion', exclusion: { operation: 'op-1', revision: '1' } },
    ])
    const admitted = ok(await runtime.admit(admission('call-1', 'op-1', dummyRequest())))
    expect(admitted.recovered).toBe(false)
    expect((await recordsOf(store)).map(record => record.kind).sort()).toEqual([
      'account',
      'call',
      'operation',
      'result',
      'task',
    ])
    const again = ok(await runtime.admit(admission('call-1', 'op-1', dummyRequest())))
    expect(again).toEqual({ state: admitted.state, recovered: true })
    expect(store.commits).toBe(2)
  })

  it('14 exclusion: a negative probe of another tenant or without the query permission writes nothing', async () => {
    const probes = (runtime: ReturnType<typeof harness>['runtime'], principal: Principal) => [
      runtime.lookup({
        ...admission('call-1', 'op-1', dummyRequest(), principal),
        admission: operationId('op-1'),
      }),
      runtime.queryOperation({
        ...admission('call-1', 'op-1', dummyRequest(), principal),
        operation: operationId('op-1'),
      }),
    ]
    const foreign = harness()
    for (const probe of probes(foreign.runtime, principalB))
      expect(await probe).toMatchObject({ failure: { kind: 'denied' } })
    const ungranted = harness({ deniedActions: ['lookup', 'query-operation'] })
    for (const probe of probes(ungranted.runtime, principalA))
      expect(await probe).toMatchObject({ failure: { kind: 'denied' } })
    const blind = harness({ accessUnavailable: 'directory down' })
    for (const probe of probes(blind.runtime, principalA))
      expect(await probe).toMatchObject({
        failure: { kind: 'unavailable', dependency: 'access-guard' },
      })
    expect([foreign.store.commits, ungranted.store.commits, blind.store.commits]).toEqual([0, 0, 0])
    expect([foreign.store.reads, ungranted.store.reads, blind.store.reads]).toEqual([0, 0, 0])
  })
})
