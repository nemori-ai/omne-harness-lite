import { describe, expect, it } from 'vitest'
import type { ToolState } from '@omne-harness/tool-contract'
import {
  admission,
  callId,
  dummyRequest,
  evidence,
  failure,
  functionDefinition,
  harness,
  judged,
  ok,
  operationId,
  principalA,
  principalB,
  request,
  tenantA,
  tenantB,
} from './runtime-values.ts'

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
        evidence: { kind: 'retained', custody: evidence('kept', 'session') },
      }),
      account: runtime.account(theirs),
    }
    for (const [action, probe] of Object.entries(probes)) {
      expect([action, await probe]).toEqual([
        action,
        { failure: { kind: 'denied', action: expect.any(String) } },
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
    const changed = dummyRequest({ consumer: { ...dummyRequest().consumer, position: 'step-2' } })
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
    expect(await commands.enqueue({ ...context, expected: '0' as never })).toEqual({
      failure: { kind: 'stale-revision', current: first.state.revision },
    })
    expect(await commands.enqueue({ ...context, expected: first.state.revision })).toMatchObject({
      failure: { kind: 'unsupported', reason: expect.stringContaining('enqueue') },
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
    expect(store.commits).toBe(2)
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

  it('12 logical terminal: a well-formed call to an available tool is not run in this increment', async () => {
    const { runtime, store, spies } = harness()
    expect(await runtime.admit(admission('call-1', 'op-1', request()))).toMatchObject({
      failure: { kind: 'unsupported', adoption: functionDefinition().adoption },
    })
    expect(store.commits).toBe(0)
    expect([...spies.calls.keys()]).toEqual([])
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

  it('13 permission: a background start needs the author permission', async () => {
    const { runtime } = harness()
    expect(
      await runtime.admit(admission('call-1', 'op-1', request({ mode: 'background' }))),
    ).toEqual({
      failure: { kind: 'invalid', field: 'request.mode', reason: 'background-not-allowed' },
    })
  })
})
