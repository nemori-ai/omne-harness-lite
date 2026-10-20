import { describe, expect, it } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import { createToolRuntime, type ToolLedgerAction } from '@omne-harness/tool'
import {
  readToolInvocationRef,
  readToolOperationRef,
  type ToolInvocationRef,
  type ToolInvokeOutcome,
} from '@omne-harness/tool-contract'
import { testAssembly } from './testing-values.ts'
import { admitCall, startHarness } from './start-values.ts'
import {
  callId,
  dummyRequest,
  evidence,
  guards,
  ok,
  operationId,
  principalA,
  principalB,
  request,
  tenantA,
  tenantB,
} from './runtime-values.ts'

function accepted(outcome: ToolInvokeOutcome) {
  if (outcome.kind !== 'accepted') throw new Error(JSON.stringify(outcome))
  return outcome
}

const access = (reference: ToolInvocationRef) => ({
  principal: principalA,
  tenant: tenantA,
  reference,
})

function runtimeAssembly() {
  const assembly = testAssembly()
  const provider = createToolRuntime(assembly.dependencies, assembly.configuration)
  return { ...assembly, provider, runtime: provider.runtime }
}

describe('ordinary invocation and saved references', () => {
  it('admits identical payloads as independent calls, including concurrent invokes', async () => {
    const { runtime, store, source } = runtimeAssembly()
    const payload = dummyRequest()
    const outcomes = await Promise.all([
      runtime.invoke({ principal: principalA, tenant: tenantA, request: payload }),
      runtime.invoke({ principal: principalA, tenant: tenantA, request: payload }),
    ])
    const [first, second] = outcomes.map(accepted)
    if (first === undefined || second === undefined) throw new Error('missing outcome')
    expect(first.reference).not.toBe(second.reference)
    expect(readToolInvocationRef(first.reference).call).not.toBe(
      readToolInvocationRef(second.reference).call,
    )
    expect(source.bindings()).toHaveLength(2)
    for (const outcome of [first, second]) {
      expect(await runtime.queries.lookup(access(outcome.reference))).toMatchObject({
        ok: { kind: 'found' },
      })
      const read = await store.read({
        kind: 'call',
        tenant: tenantA,
        call: readToolInvocationRef(outcome.reference).call,
      })
      expect(
        read.kind === 'complete' && read.records.filter(record => record.kind === 'call'),
      ).toHaveLength(1)
    }
  })

  it('fixes nested payload data before the first await without freezing the caller object', async () => {
    const base = testAssembly()
    let resume: (() => void) | undefined
    const pending = new Promise<void>(resolve => {
      resume = resolve
    })
    const runtime = createToolRuntime(
      {
        ...base.dependencies,
        invocationIdentities: {
          newInvocation: async () => {
            await pending
            return base.dependencies.invocationIdentities.newInvocation()
          },
        },
      },
      base.configuration,
    ).runtime
    const payload = structuredClone(dummyRequest())
    const expected = structuredClone(payload)
    const invoking = runtime.invoke({ principal: principalA, tenant: tenantA, request: payload })
    Object.assign(payload.consumer, { position: 'changed' })
    Object.assign(payload.availability.definition, { name: 'changed' })
    Object.assign(payload.arguments, { effective: '{}' })
    resume?.()
    const outcome = accepted(await invoking)
    expect(base.source.bindings()[0]?.request).toEqual(expected)
    expect(await runtime.queries.lookup(access(outcome.reference))).toMatchObject({
      ok: { kind: 'found' },
    })
    expect(Object.isFrozen(payload.consumer)).toBe(false)
  })

  it('rejects caller-selected identities and origins and unreadable payloads before minting', async () => {
    const base = runtimeAssembly()
    let minted = 0
    const runtime = createToolRuntime(
      {
        ...base.dependencies,
        invocationIdentities: {
          newInvocation: () => {
            minted += 1
            return base.dependencies.invocationIdentities.newInvocation()
          },
        },
      },
      base.configuration,
    ).runtime
    for (const field of ['call', 'operation', 'invocation', 'source']) {
      const outcome = await runtime.invoke({
        principal: principalA,
        tenant: tenantA,
        request: { ...dummyRequest(), [field]: 'forged' },
      })
      expect(outcome).toMatchObject({
        kind: 'rejected',
        failure: { kind: 'invalid', reason: 'unknown-field' },
      })
    }
    const payload = dummyRequest()
    Object.defineProperty(payload, 'consumer', {
      get: () => {
        throw new Error('must not read getter')
      },
    })
    expect(
      await runtime.invoke({ principal: principalA, tenant: tenantA, request: payload }),
    ).toMatchObject({ kind: 'rejected', failure: { kind: 'invalid', reason: 'accessor' } })
    expect(minted).toBe(0)
    expect(base.store.commits).toBe(0)
  })

  it.each(['unknown-applied', 'throw-applied'] as const)(
    'recovers the original admission after %s and runtime reconstruction',
    async fault => {
      const base = runtimeAssembly()
      base.store.injectCommit(fault)
      const outcome = await base.runtime.invoke({
        principal: principalA,
        tenant: tenantA,
        request: dummyRequest(),
      })
      if (outcome.kind !== 'commit-unknown') throw new Error(JSON.stringify(outcome))
      const commits = base.store.commits
      const rebuilt = createToolRuntime(base.dependencies, base.configuration).runtime
      expect(await rebuilt.queries.lookup(access(outcome.reference))).toMatchObject({
        ok: { kind: 'found' },
      })
      expect(base.store.commits).toBe(commits)
      expect(base.source.bindings()).toHaveLength(1)
      expect(base.host.scheduled).toHaveLength(0)
    },
  )

  it('preserves references when admission or delivery throws after its real commit', async () => {
    const base = testAssembly()
    const runtime = createToolRuntime(
      {
        ...base.dependencies,
        admissions: {
          admit: async input => {
            await base.dependencies.admissions.admit(input)
            throw new Error('lost reply')
          },
        },
        commands: {
          ...base.dependencies.commands,
          releaseDelivery: async input => {
            await base.dependencies.commands.releaseDelivery(input)
            throw new Error('lost reply')
          },
        },
      },
      base.configuration,
    ).runtime
    const outcome = await runtime.invoke({
      principal: principalA,
      tenant: tenantA,
      request: dummyRequest(),
    })
    if (outcome.kind !== 'commit-unknown') throw new Error(JSON.stringify(outcome))
    expect(await runtime.queries.lookup(access(outcome.reference))).toMatchObject({
      ok: { kind: 'found' },
    })
    const released = await runtime.commands.releaseDelivery({
      ...access(outcome.reference),
      result: 'v1' as never,
      delivery: 'd1' as never,
      consumer: dummyRequest().consumer,
      evidence: { kind: 'retained', custody: evidence('kept', 'consumer') },
    })
    if (released.kind !== 'commit-unknown') throw new Error(JSON.stringify(released))
    expect(
      await runtime.queries.queryOperation({
        principal: principalA,
        tenant: tenantA,
        operation: released.operation,
      }),
    ).toMatchObject({ ok: { kind: 'committed' } })
    expect(base.source.bindings()).toHaveLength(1)
  })

  it('keeps unknown distinct from reliable exclusion and fences a delayed admission', async () => {
    const base = runtimeAssembly()
    base.store.injectCommit('unknown-delayed')
    const outcome = await base.runtime.invoke({
      principal: principalA,
      tenant: tenantA,
      request: dummyRequest(),
    })
    if (outcome.kind !== 'commit-unknown') throw new Error(JSON.stringify(outcome))
    base.store.injectCommit('unknown-dropped')
    expect(await base.runtime.queries.lookup(access(outcome.reference))).toMatchObject({
      failure: { kind: 'unavailable', dependency: 'ledger-store' },
    })
    expect(await base.runtime.queries.lookup(access(outcome.reference))).toEqual({
      ok: { kind: 'not-accepted', operation: readToolInvocationRef(outcome.reference).admission },
    })
    expect(base.store.landDelayed()).toEqual([{ kind: 'conflict' }])
    expect(base.source.bindings()).toHaveLength(1)
  })

  it.each(['failure', 'throw'] as const)(
    'keeps an accepted receipt when schedule returns %s',
    async fault => {
      const base = testAssembly()
      const runtime = createToolRuntime(
        {
          ...base.dependencies,
          instances: {
            ...base.dependencies.instances,
            schedule: () =>
              fault === 'throw'
                ? Promise.reject(new Error('lost schedule'))
                : Promise.resolve(
                    fail({ kind: 'unavailable', dependency: 'host', diagnostic: 'offline' }),
                  ),
          },
        },
        base.configuration,
      ).runtime
      const outcome = accepted(
        await runtime.invoke({ principal: principalA, tenant: tenantA, request: request() }),
      )
      expect(outcome.state.phase).toBe('accepted')
      expect(await runtime.queries.lookup(access(outcome.reference))).toMatchObject({
        ok: { kind: 'found' },
      })
    },
  )

  it('rejects a reused new identity and never schedules its recovered receipt', async () => {
    const base = runtimeAssembly()
    const payload = request()
    const first = accepted(
      await base.runtime.invoke({ principal: principalA, tenant: tenantA, request: payload }),
    )
    const parts = readToolInvocationRef(first.reference)
    const binding = base.source.bindings()[0]
    if (binding === undefined) throw new Error('missing issuance')
    base.identities.planInvocation(parts.call, parts.admission)
    base.host.scheduled.splice(0)
    const runtime = createToolRuntime(
      {
        ...base.dependencies,
        sourceIssuer: {
          bind: () => Promise.resolve(succeed(binding.invocation)),
        },
      },
      base.configuration,
    ).runtime
    expect(
      await runtime.invoke({ principal: principalA, tenant: tenantA, request: payload }),
    ).toMatchObject({
      kind: 'rejected',
      failure: { kind: 'unavailable', dependency: 'toolIdentities' },
    })
    expect(base.host.scheduled).toHaveLength(0)
  })

  it('stops before source issuance or admission when identity allocation fails', async () => {
    const base = testAssembly()
    for (const fault of ['throw', 'unknown', 'invalid-text'] as const) {
      if (fault === 'invalid-text') base.identities.planInvocation('has space', 'admission')
      const runtime = createToolRuntime(
        {
          ...base.dependencies,
          invocationIdentities: {
            newInvocation: () => {
              if (fault === 'throw') throw new Error('secret')
              if (fault === 'unknown')
                return Promise.resolve(
                  fail({ kind: 'commit-unknown', operation: operationId('unknown-identity') }),
                )
              return base.dependencies.invocationIdentities.newInvocation()
            },
          },
        },
        base.configuration,
      ).runtime
      expect(
        await runtime.invoke({ principal: principalA, tenant: tenantA, request: request() }),
      ).toMatchObject({
        kind: 'rejected',
        failure: { kind: 'unavailable', dependency: 'toolIdentities' },
      })
    }
    expect(base.source.bindings()).toHaveLength(0)
    expect(base.store.reads + base.store.commits).toBe(0)
  })

  it('does not mint an operation for unsupported control', async () => {
    const base = runtimeAssembly()
    const invoked = accepted(
      await base.runtime.invoke({
        principal: principalA,
        tenant: tenantA,
        request: dummyRequest(),
      }),
    )
    let minted = 0
    const runtime = createToolRuntime(
      {
        ...base.dependencies,
        operationIdentities: {
          newOperation: () => {
            minted += 1
            throw new Error('unexpected operation')
          },
        },
      },
      base.configuration,
    ).runtime
    expect(
      await runtime.commands.control({ ...access(invoked.reference), intent: { kind: 'stop' } }),
    ).toMatchObject({ kind: 'rejected', failure: { kind: 'unsupported' } })
    expect(minted).toBe(0)
  })

  it('does not submit an admission when source issuance is unknown or unavailable', async () => {
    const base = testAssembly()
    for (const kind of ['commit-unknown', 'throw', 'unavailable'] as const) {
      const runtime = createToolRuntime(
        {
          ...base.dependencies,
          sourceIssuer: {
            bind: input =>
              kind === 'throw'
                ? Promise.reject(new Error('secret'))
                : Promise.resolve(
                    fail(
                      kind === 'commit-unknown'
                        ? { kind, operation: input.operation }
                        : { kind, dependency: 'source', diagnostic: 'offline' },
                    ),
                  ),
          },
        },
        base.configuration,
      ).runtime
      expect(
        await runtime.invoke({ principal: principalA, tenant: tenantA, request: request() }),
      ).toMatchObject({ kind: 'rejected', failure: { kind: 'unavailable' } })
    }
    expect(base.store.reads + base.store.commits).toBe(0)
    expect(base.host.scheduled).toHaveLength(0)
  })

  it('returns a queryable original operation reference for a lost delivery receipt', async () => {
    for (const fault of ['unknown-applied', 'throw-applied'] as const) {
      const base = runtimeAssembly()
      const invoked = accepted(
        await base.runtime.invoke({
          principal: principalA,
          tenant: tenantA,
          request: dummyRequest(),
        }),
      )
      base.store.injectCommit(fault)
      const outcome = await base.runtime.commands.releaseDelivery({
        ...access(invoked.reference),
        result: 'v1' as never,
        delivery: 'd1' as never,
        consumer: dummyRequest().consumer,
        evidence: { kind: 'retained', custody: evidence('kept', 'consumer') },
      })
      if (outcome.kind !== 'commit-unknown') throw new Error(JSON.stringify(outcome))
      const original = readToolOperationRef(outcome.operation)
      expect(original.call).toBe(readToolInvocationRef(invoked.reference).call)
      const before = base.store.commits
      const rebuilt = createToolRuntime(base.dependencies, base.configuration).runtime
      expect(
        await rebuilt.queries.queryOperation({
          principal: principalA,
          tenant: tenantA,
          operation: outcome.operation,
        }),
      ).toMatchObject({ ok: { kind: 'committed' } })
      expect(base.store.commits).toBe(before)
    }
  })

  it('keeps directory failures separate and never consults it for persistent reads or delivery', async () => {
    const base = testAssembly()
    let connects = 0
    const directoryReplies = [
      fail({ kind: 'unavailable' as const, dependency: 'directory', diagnostic: 'offline' }),
      succeed({ kind: 'no-live-route' as const }),
      fail({
        kind: 'unsupported' as const,
        adoption: dummyRequest().settings,
        reason: 'directory',
      }),
    ]
    const runtime = createToolRuntime(
      {
        ...base.dependencies,
        instances: {
          ...base.dependencies.instances,
          directory: {
            connect: () => {
              const answer = directoryReplies[connects++]
              if (answer === undefined) throw new Error('extra connect')
              return Promise.resolve(answer)
            },
          },
        },
      },
      base.configuration,
    ).runtime
    const invoked = accepted(
      await runtime.invoke({ principal: principalA, tenant: tenantA, request: dummyRequest() }),
    )
    for (const expected of directoryReplies)
      expect(await runtime.instances.connect(access(invoked.reference))).toEqual(expected)
    expect(await runtime.queries.lookup(access(invoked.reference))).toMatchObject({
      ok: { kind: 'found' },
    })
    expect(
      await runtime.queries.readResult({
        ...access(invoked.reference),
        result: 'v1' as never,
        after: null,
      }),
    ).toHaveProperty('ok')
    expect(
      await runtime.commands.releaseDelivery({
        ...access(invoked.reference),
        result: 'v1' as never,
        delivery: 'd1' as never,
        consumer: dummyRequest().consumer,
        evidence: { kind: 'retained', custody: evidence('kept', 'consumer') },
      }),
    ).toMatchObject({ kind: 'committed' })
    expect(connects).toBe(3)
  })

  it('rechecks current principal and rejects foreign or forged tenants before reading a port', async () => {
    const deniedActions: ToolLedgerAction[] = []
    const base = testAssembly()
    const secured = testAssembly({
      guards: { ...guards({ deniedActions }), sources: base.source.guard },
      sourceIssuer: base.source.issuer,
    })
    const runtime = createToolRuntime(secured.dependencies, secured.configuration).runtime
    const invoked = accepted(
      await runtime.invoke({ principal: principalA, tenant: tenantA, request: dummyRequest() }),
    )
    const before = secured.store.reads
    for (const input of [
      { principal: principalB, tenant: tenantB, reference: invoked.reference },
      { principal: principalA, tenant: { ...tenantA } as never, reference: invoked.reference },
    ]) {
      expect(await runtime.queries.lookup(input)).toEqual({
        failure: { kind: 'denied', action: 'lookup' },
      })
    }
    expect(secured.store.reads).toBe(before)
    deniedActions.push('lookup', 'read-result', 'release-delivery')
    expect(await runtime.queries.lookup(access(invoked.reference))).toEqual({
      failure: { kind: 'denied', action: 'lookup' },
    })
    expect(
      await runtime.queries.readResult({
        ...access(invoked.reference),
        result: 'v1' as never,
        after: null,
      }),
    ).toEqual({ failure: { kind: 'denied', action: 'read-result' } })
    expect(
      await runtime.commands.releaseDelivery({
        ...access(invoked.reference),
        result: 'v1' as never,
        delivery: 'd1' as never,
        consumer: dummyRequest().consumer,
        evidence: { kind: 'retained', custody: evidence('kept', 'consumer') },
      }),
    ).toMatchObject({ kind: 'rejected', failure: { kind: 'denied' } })
    expect(secured.store.reads).toBe(before)
  })

  it('records each host instance on its actual execution and reuses it on repeated wake-ups', async () => {
    const base = startHarness()
    const unlimited = { limits: { concurrency: null, foregroundMs: null, backgroundAfterMs: null } }
    await admitCall(base, 'first', unlimited)
    await admitCall(base, 'second', unlimited)
    await base.drive('first', 'second')
    const first = await base.host.instanceOf(callId('first'))
    const second = await base.host.instanceOf(callId('second'))
    expect(first).not.toBe(second)
    expect(
      ok(
        await base.commands.loadRecovery({
          principal: principalA,
          tenant: tenantA,
          call: callId('first'),
        }),
      ).execution,
    ).toMatchObject({ instance: first })
    expect(
      ok(
        await base.commands.loadRecovery({
          principal: principalA,
          tenant: tenantA,
          call: callId('second'),
        }),
      ).execution,
    ).toMatchObject({ instance: second })
    await base.runOnce('first')
    expect(
      ok(
        await base.commands.loadRecovery({
          principal: principalA,
          tenant: tenantA,
          call: callId('first'),
        }),
      ).execution,
    ).toMatchObject({ instance: first })
    expect(base.binding.executions).toEqual(['first', 'second'])
  })
})
