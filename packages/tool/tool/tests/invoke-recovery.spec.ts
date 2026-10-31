import { describe, expect, it, vi } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import { createToolRuntime, type ToolInvokeAuthority, type AccessVerdict } from '@omne-harness/tool'
import { createTestInvocationSource } from '@omne-harness/tool/testing'
import {
  readToolOperationRef,
  type ToolInvokeOutcome,
  type ToolInvokeRequest,
  type OperationResolution,
  type ToolOperationId,
} from '@omne-harness/tool-contract'
import { readToolInvocationRef, decodeToolRevision } from '@omne-harness/tool-contract/provider'
import { testAssembly } from './testing-values.ts'
import { startHarness } from './start-values.ts'
import {
  dummyRequest,
  request,
  principalA,
  principalB,
  tenantA,
  tenantB,
  invokeAuthority,
  snapshotTestPrincipal,
  evidence,
  ok,
  type Principal,
} from './runtime-values.ts'

function accepted(outcome: ToolInvokeOutcome) {
  if (outcome.kind !== 'accepted') throw new Error(JSON.stringify(outcome))
  return outcome
}
const input = (
  payload: ToolInvokeRequest = request(),
  principal = principalA,
  tenant = tenantA,
) => ({ principal, tenant, request: payload })

function paired(authority: ToolInvokeAuthority<Principal> = invokeAuthority()) {
  const source = createTestInvocationSource({ authority, snapshotPrincipal: snapshotTestPrincipal })
  const base = testAssembly()
  const assembly = testAssembly({
    ...base.input,
    guards: { ...base.input.guards, sources: source.guard },
    sourceIssuer: source.issuer,
  })
  const dependencies = {
    ...assembly.dependencies,
    admissions: { ...assembly.dependencies.admissions },
  }
  const one = createToolRuntime(dependencies, assembly.configuration).runtime
  const two = createToolRuntime(dependencies, assembly.configuration).runtime
  return { ...assembly, dependencies, host: base.host, source, one, two }
}

function barrier() {
  let release = () => {}
  const waiting = new Promise<void>(resolve => {
    release = resolve
  })
  return { waiting, release }
}

describe('public persistent intent recovery over shared non-durable source and ledger', () => {
  it('merges concurrent runtimes into one admission, pending dispatch and actual launch', async () => {
    const h = startHarness()
    const secondRuntime = h.rebuildRuntime()
    const [first, concurrent] = (
      await Promise.all([h.runtime.invoke(input()), secondRuntime.invoke(input())])
    ).map(accepted)
    if (first === undefined || concurrent === undefined)
      throw new Error('missing concurrent replies')
    expect(concurrent.reference).toBe(first.reference)
    const original = readToolInvocationRef(first.reference)
    await Promise.all(Array.from({ length: 8 }, () => h.runtime.invoke(input())))
    await h.drive(original.call)
    expect(h.binding.controls.launches()).toBe(1)
    const again = accepted(await h.runtime.invoke(input()))
    expect(again.reference).toBe(first.reference)
    expect(again.state).toEqual(first.state)
    expect(again.recovered).toBe(true)
    expect(
      await h.runtime.queries.lookup({
        principal: principalA,
        tenant: tenantA,
        reference: first.reference,
      }),
    ).toMatchObject({ ok: { state: { phase: 'running' } } })
    expect(h.host.scheduled).toHaveLength(0)
    await h.drive(original.call)
    expect(h.binding.controls.launches()).toBe(1)

    const gate = barrier()
    const authority = invokeAuthority()
    let qualified = 0
    const assembly = paired({
      ...authority,
      qualify: async access => {
        qualified += 1
        if (qualified <= 2) await gate.waiting
        return authority.qualify(access)
      },
    })
    const one = assembly.one.invoke(input())
    const two = assembly.two.invoke(input())
    gate.release()
    const replies = (await Promise.all([one, two])).map(accepted)
    expect(replies[0]?.reference).toBe(replies[1]?.reference)
    expect(replies.some(reply => reply.recovered)).toBe(true)
    expect(assembly.source.bindings()).toHaveLength(1)
    const ref = readToolInvocationRef(
      (
        replies[0] ??
        (() => {
          throw new Error('missing reply')
        })()
      ).reference,
    )
    const facts = await assembly.store.read({ kind: 'call', tenant: tenantA, call: ref.call })
    expect(
      facts.kind === 'complete' &&
        facts.records.filter(
          record => record.kind === 'operation' && record.operation.operation === ref.admission,
        ),
    ).toHaveLength(1)
    const queue = await assembly.store.read({
      kind: 'queue',
      tenant: tenantA,
      key: JSON.stringify(['scope-owner', 'scope-1', 'read_file']),
    })
    expect(
      queue.kind === 'complete' && queue.records.filter(record => record.kind === 'queue-entry'),
    ).toHaveLength(1)
    expect(assembly.host.scheduled).toHaveLength(1)
    expect(assembly.host.scheduleAttempts.length).toBeGreaterThan(1)
  })

  it('wakes the original starting task after a driver abort immediately following real prepareStart', async () => {
    const stopped = new AbortController()
    const h = startHarness({
      commands: commands => ({
        ...commands,
        prepareStart: async access => {
          const result = await commands.prepareStart(access)
          if ('ok' in result) stopped.abort()
          return result
        },
      }),
    })
    const first = accepted(await h.runtime.invoke(input()))
    const { call } = readToolInvocationRef(first.reference)
    expect(h.host.scheduled.shift()?.call).toBe(call)
    await h.runOnce(call, stopped.signal)
    expect(
      await h.runtime.queries.lookup({
        principal: principalA,
        tenant: tenantA,
        reference: first.reference,
      }),
    ).toMatchObject({ ok: { kind: 'found', state: { phase: 'starting' } } })
    const recovery = ok(
      await h.commands.loadRecovery({ principal: principalA, tenant: tenantA, call }),
    )
    expect(recovery.tasks.some(task => task.kind === 'start')).toBe(true)
    expect(h.binding.controls.launches()).toBe(0)
    expect(h.host.scheduled).toHaveLength(0)
    const recovered = accepted(await h.runtime.invoke(input()))
    expect(recovered).toEqual({ ...first, recovered: true })
    expect(h.host.scheduleAttempts).toHaveLength(2)
    expect(h.host.scheduled).toHaveLength(1)
    await h.host.runScheduled()
    expect(h.binding.controls.launches()).toBe(1)
    expect(
      await h.runtime.queries.lookup({
        principal: principalA,
        tenant: tenantA,
        reference: first.reference,
      }),
    ).toMatchObject({ ok: { state: { phase: 'running' } } })
    expect(accepted(await h.runtime.invoke(input()))).toEqual({ ...first, recovered: true })
    expect(h.host.scheduleAttempts).toHaveLength(2)
    await h.runOnce(call)
    expect(h.binding.controls.launches()).toBe(1)
  })

  it.each(['preparing', 'queued'] as const)(
    'wakes the original %s task after its real command commits and the driver aborts',
    async phase => {
      const stopped = new AbortController()
      const h = startHarness({
        commands: commands => ({
          ...commands,
          planPreparation: async access => {
            const result = await commands.planPreparation(access)
            if (phase === 'preparing' && 'ok' in result) stopped.abort()
            return result
          },
          enqueue: async access => {
            const result = await commands.enqueue(access)
            if (phase === 'queued' && 'ok' in result) stopped.abort()
            return result
          },
        }),
      })
      const first = accepted(await h.runtime.invoke(input()))
      const { call, admission } = readToolInvocationRef(first.reference)
      expect(first.state.phase).toBe('accepted')
      expect(h.host.scheduled.shift()?.call).toBe(call)
      await h.runOnce(call, stopped.signal)
      expect(
        await h.runtime.queries.lookup({
          principal: principalA,
          tenant: tenantA,
          reference: first.reference,
        }),
      ).toMatchObject({ ok: { kind: 'found', state: { phase } } })
      const recovery = ok(
        await h.commands.loadRecovery({ principal: principalA, tenant: tenantA, call }),
      )
      expect(recovery.tasks.length).toBeGreaterThan(0)
      expect(h.binding.controls.launches()).toBe(0)
      expect(h.host.scheduled).toHaveLength(0)
      const queue = await h.queue()
      expect(queue).toHaveLength(1)
      expect(queue[0]?.call).toBe(call)
      const source = h.source.bindings()
      const recovered = accepted(await h.rebuildRuntime().invoke(input()))
      expect(recovered).toEqual({ ...first, recovered: true })
      expect(h.host.scheduleAttempts).toHaveLength(2)
      expect(h.host.scheduled).toHaveLength(1)
      expect(await h.queue()).toEqual(queue)
      expect(h.source.bindings()).toEqual(source)
      const facts = await h.memory.read({ kind: 'call', tenant: tenantA, call })
      expect(
        facts.kind === 'complete' &&
          facts.records.filter(
            record => record.kind === 'operation' && record.operation.operation === admission,
          ),
      ).toHaveLength(1)
      await h.host.runScheduled()
      expect(h.binding.controls.launches()).toBe(1)
      expect(
        await h.runtime.queries.lookup({
          principal: principalA,
          tenant: tenantA,
          reference: first.reference,
        }),
      ).toMatchObject({ ok: { state: { phase: 'running' } } })
      expect(accepted(await h.runtime.invoke(input()))).toEqual({ ...first, recovered: true })
      expect(h.host.scheduleAttempts).toHaveLength(2)
    },
  )

  it('does not overwrite the winning request when two runtimes race different inputs for one key', async () => {
    const gate = barrier()
    const real = invokeAuthority()
    const a = paired({
      ...real,
      qualify: async access => {
        await gate.waiting
        return real.qualify(access)
      },
    })
    const original = request()
    const different = { ...original, arguments: { ...original.arguments, effective: '{}' } }
    const pending = [a.one.invoke(input(original)), a.two.invoke(input(different))]
    gate.release()
    const outcomes = await Promise.all(pending)
    const winner = outcomes.find(outcome => outcome.kind === 'accepted')
    if (winner?.kind !== 'accepted') throw new Error('missing winner')
    expect(outcomes.filter(outcome => outcome.kind === 'accepted')).toHaveLength(1)
    expect(outcomes.find(outcome => outcome.kind === 'rejected')).toEqual({
      kind: 'rejected',
      failure: {
        kind: 'conflict',
        operation: readToolInvocationRef(winner.reference).admission,
      },
    })
    expect(a.source.bindings()).toHaveLength(1)
    const fixed = a.source.bindings()[0]?.request
    if (fixed === undefined) throw new Error('missing original source binding')
    expect(accepted(await a.two.invoke(input(fixed))).reference).toBe(winner.reference)
    expect(a.source.bindings()[0]?.request).toEqual(fixed)
  })

  it.each(['arguments', 'scope', 'limits'] as const)(
    'rejects changed %s under the original admission without allocation',
    async field => {
      const a = paired()
      const first = accepted(await a.one.invoke(input()))
      const payload = request()
      const changed =
        field === 'arguments'
          ? { ...payload, arguments: { ...payload.arguments, effective: '{}' } }
          : field === 'scope'
            ? { ...payload, scope: { ...payload.scope, key: 'other' } }
            : { ...payload, limits: { ...payload.limits, concurrency: 2 } }
      const commits = a.store.commits
      expect(await a.two.invoke(input(changed))).toEqual({
        kind: 'rejected',
        failure: {
          kind: 'conflict',
          operation: readToolInvocationRef(first.reference).admission,
        },
      })
      expect(a.source.bindings()).toHaveLength(1)
      expect(a.store.commits).toBe(commits)
      expect(accepted(await a.two.invoke(input())).reference).toBe(first.reference)
    },
  )

  it('keeps each consumer component and tenant independent, including separator-like text', async () => {
    const a = paired()
    const base = dummyRequest()
    const requests = ['owner', 'work', 'position', 'purpose'].map(field => ({
      ...base,
      consumer: {
        ...base.consumer,
        [field]: `${base.consumer[field as keyof typeof base.consumer]}|other`,
      },
    }))
    // An explicit authority accepts these owners for this key-encoding-only test.
    const authority = invokeAuthority()
    const b = paired({
      ...authority,
      qualify: access =>
        authority.qualify({
          ...access,
          consumer: {
            ...access.consumer,
            owner: 'consumer',
            work: 'work-1',
            purpose: 'tool-result',
          },
        }),
    })
    const outcomes = (
      await Promise.all([base, ...requests].map(payload => b.one.invoke(input(payload))))
    ).map(accepted)
    expect(new Set(outcomes.map(outcome => outcome.reference)).size).toBe(5)
    const foreign = accepted(await a.one.invoke(input(base, principalB, tenantB)))
    const mine = accepted(await a.one.invoke(input(base)))
    expect(foreign.reference).not.toBe(mine.reference)
    const left = { ...base, consumer: { ...base.consumer, work: 'a|b', position: 'c' } }
    const right = { ...base, consumer: { ...base.consumer, work: 'a', position: 'b|c' } }
    expect(accepted(await b.one.invoke(input(left))).reference).not.toBe(
      accepted(await b.one.invoke(input(right))).reference,
    )
  })

  it.each(['association', 'issuance'] as const)(
    'continues the same source after a lost %s reply',
    async fault => {
      const a = paired()
      let first = true
      const runtime = createToolRuntime(
        {
          ...a.dependencies,
          sourceIssuer: {
            resolve: async access => {
              const resolved = await a.source.issuer.resolve(access)
              if (!first || resolved.kind !== 'bound') return resolved
              first = false
              return fault === 'association'
                ? { kind: 'association-unknown' }
                : {
                    kind: 'issuance-unknown',
                    call: resolved.call,
                    admission: resolved.admission,
                  }
            },
          },
        },
        a.configuration,
      ).runtime
      const lost = await runtime.invoke(input())
      expect(lost.kind).toBe(fault === 'association' ? 'association-unknown' : 'commit-unknown')
      expect(a.store.commits).toBe(0)
      const recovered = accepted(await runtime.invoke(input()))
      const binding = a.source.bindings()[0]
      expect(binding?.call).toBe(readToolInvocationRef(recovered.reference).call)
      if (lost.kind === 'commit-unknown') expect(lost.reference).toBe(recovered.reference)
      expect(recovered.recovered).toBe(true)
      expect(a.source.bindings()).toHaveLength(1)
    },
  )

  it('joins a source write whose answer is still in flight and never replaces its winner', async () => {
    const a = paired()
    const gate = barrier()
    const entered = barrier()
    const runtime = createToolRuntime(
      {
        ...a.dependencies,
        sourceIssuer: {
          resolve: async access => {
            const resolved = await a.source.issuer.resolve(access)
            entered.release()
            await gate.waiting
            return resolved
          },
        },
      },
      a.configuration,
    ).runtime
    const pending = runtime.invoke(input())
    await entered.waiting
    const winner = accepted(await a.two.invoke(input()))
    gate.release()
    expect(accepted(await pending).reference).toBe(winner.reference)
    expect(a.source.bindings()).toHaveLength(1)
  })

  it('does not mint a second identity when an unresolved first source command has not yet committed', async () => {
    const a = paired()
    const gate = barrier()
    let late: Promise<unknown> | undefined
    const runtime = createToolRuntime(
      {
        ...a.dependencies,
        sourceIssuer: {
          resolve: async access => {
            late = gate.waiting.then(() => a.source.issuer.resolve(access))
            return { kind: 'association-unknown' }
          },
        },
      },
      a.configuration,
    ).runtime
    expect(await runtime.invoke(input())).toEqual({ kind: 'association-unknown' })
    expect(a.source.bindings()).toHaveLength(0)
    const winner = accepted(await a.two.invoke(input()))
    gate.release()
    await late
    expect(a.source.bindings()).toHaveLength(1)
    expect(accepted(await a.one.invoke(input())).reference).toBe(winner.reference)
  })

  it.each(['unknown-applied', 'unknown-delayed', 'unknown-dropped', 'throw-applied'] as const)(
    'resumes original identity after admission %s',
    async fault => {
      const a = paired()
      a.store.injectCommit(fault)
      const lost = await a.one.invoke(input())
      if (lost.kind !== 'commit-unknown') throw new Error(JSON.stringify(lost))
      // No lookup empty-read shortcut. Re-submit the original admission, including a delayed write.
      const recovered = accepted(await a.two.invoke(input()))
      a.store.landDelayed()
      expect(recovered.reference).toBe(lost.reference)
      expect(recovered.recovered).toBe(true)
      expect(a.source.bindings()).toHaveLength(1)
    },
  )

  it('retains reservation through a definite admission refusal and later repairs a lost wake', async () => {
    const a = paired()
    let refused = true
    const runtime = createToolRuntime(
      {
        ...a.dependencies,
        admissions: {
          admit: access =>
            refused
              ? Promise.resolve(fail({ kind: 'denied', action: 'admit' }))
              : a.ledger.admissions.admit(access),
        },
        instances: {
          ...a.host,
          schedule: async () => {
            throw new Error('wake lost')
          },
        },
      },
      a.configuration,
    ).runtime
    expect(await runtime.invoke(input())).toMatchObject({
      kind: 'rejected',
      failure: { kind: 'denied' },
    })
    refused = false
    const original = accepted(await runtime.invoke(input()))
    expect(original.recovered).toBe(true)
    expect(a.host.scheduled).toHaveLength(0)
    expect(accepted(await a.two.invoke(input())).reference).toBe(original.reference)
    expect(a.host.scheduled).toHaveLength(1)
  })

  it.each(['unavailable', 'throw'] as const)(
    'preserves the accepted receipt and conservatively wakes after current lookup %s',
    async fault => {
      const a = paired()
      const first = accepted(await a.one.invoke(input()))
      a.host.scheduled.splice(0)
      const runtime = createToolRuntime(
        {
          ...a.dependencies,
          reads: {
            ...a.dependencies.reads,
            lookup: async () => {
              if (fault === 'throw') throw new Error('private query connection')
              return fail({
                kind: 'unavailable',
                dependency: 'ledger-store',
                diagnostic: 'offline',
              })
            },
          },
        },
        a.configuration,
      ).runtime
      const recovered = accepted(await runtime.invoke(input()))
      expect(recovered).toEqual({ ...first, recovered: true })
      expect(a.host.scheduled).toHaveLength(1)
    },
  )

  it('returns the original settled receipt without a new queue or start', async () => {
    const a = paired()
    const first = accepted(await a.one.invoke(input(dummyRequest())))
    const commits = a.store.commits
    const second = accepted(await a.two.invoke(input(dummyRequest())))
    expect(second).toEqual({ ...first, recovered: true })
    expect(a.store.commits).toBe(commits)
    expect(a.host.scheduled).toHaveLength(0)
  })

  it('checks current qualification before conflict or identity disclosure and accepts refreshed same-subject credentials', async () => {
    let verdict: AccessVerdict = { kind: 'allowed' }
    const real = invokeAuthority()
    const authority: ToolInvokeAuthority<Principal> = {
      ...real,
      qualify: async access => {
        if (verdict.kind !== 'allowed') return verdict
        return real.qualify(access)
      },
    }
    const a = paired(authority)
    const first = accepted(await a.one.invoke(input(dummyRequest())))
    const fresh = { ...principalA, credential: 'refreshed', tenants: [...principalA.tenants] }
    const admissions = vi.spyOn(a.dependencies.admissions, 'admit')
    expect(accepted(await a.two.invoke(input(dummyRequest(), fresh))).reference).toBe(
      first.reference,
    )
    expect(admissions.mock.calls.at(-1)?.[0].principal).toBe(fresh)
    expect(a.source.bindings()[0]?.principal).toEqual(principalA)
    const different = { ...principalA, subject: 'another-subject' }
    const conflict = dummyRequest({
      limits: { concurrency: 2, foregroundMs: null, backgroundAfterMs: null },
    })
    for (const attempt of [
      input(conflict, different),
      input(conflict, principalA, { ...tenantA }),
      input(dummyRequest({ consumer: { ...dummyRequest().consumer, owner: 'forged' } })),
    ])
      expect(await a.two.invoke(attempt)).toEqual({
        kind: 'rejected',
        failure: { kind: 'denied', action: 'admit' },
      })
    expect(
      await a.two.invoke(
        input(dummyRequest({ consumer: { ...dummyRequest().consumer, work: 'forged-work' } })),
      ),
    ).toEqual({ kind: 'rejected', failure: { kind: 'denied', action: 'admit' } })
    verdict = { kind: 'denied', reason: 'revoked' }
    expect(await a.two.invoke(input(conflict))).toEqual({
      kind: 'rejected',
      failure: { kind: 'denied', action: 'admit' },
    })
    expect(a.source.bindings()).toHaveLength(1)
  })

  it.each(['unavailable', 'throw'] as const)(
    'returns unavailable when only the source principal comparator is %s, then recovers the original receipt',
    async fault => {
      let failing = false
      const real = invokeAuthority()
      const qualify = vi.fn(real.qualify)
      const samePrincipal = vi.fn(
        async (access: Parameters<typeof real.samePrincipal>[0]): Promise<AccessVerdict> => {
          if (!failing) return real.samePrincipal(access)
          if (fault === 'throw') throw new Error('secret comparator credential')
          return { kind: 'unavailable', diagnostic: 'comparator offline' }
        },
      )
      const a = paired({ qualify, samePrincipal })
      const first = accepted(await a.one.invoke(input(dummyRequest())))
      const bindings = a.source.bindings()
      const commits = a.store.commits
      const admissions = vi.spyOn(a.dependencies.admissions, 'admit')
      failing = true
      const conflicting = dummyRequest({
        limits: { concurrency: 2, foregroundMs: null, backgroundAfterMs: null },
      })
      for (const payload of [dummyRequest(), conflicting]) {
        samePrincipal.mockClear()
        const outcome = await a.two.invoke(input(payload))
        expect(outcome).toEqual({
          kind: 'rejected',
          failure: {
            kind: 'unavailable',
            dependency: 'invoke-authority',
            diagnostic: fault === 'throw' ? expect.any(String) : 'comparator offline',
          },
        })
        expect(JSON.stringify(outcome)).not.toContain('secret comparator credential')
        expect(samePrincipal).toHaveBeenCalledTimes(1)
        expect(samePrincipal).toHaveBeenCalledWith({
          current: principalA,
          original: principalA,
        })
      }
      expect(qualify).toHaveBeenCalledTimes(3)
      expect(admissions).not.toHaveBeenCalled()
      expect(a.store.commits).toBe(commits)
      expect(a.source.bindings()).toEqual(bindings)
      failing = false
      expect(accepted(await a.two.invoke(input(dummyRequest())))).toEqual({
        ...first,
        recovered: true,
      })
      expect(a.source.bindings()).toEqual(bindings)
    },
  )

  it.each(['unavailable', 'throw'] as const)(
    'does not trust %s authority or principal comparator',
    async fault => {
      let failing = false
      const real = invokeAuthority()
      const bad = async (): Promise<AccessVerdict> => {
        if (fault === 'throw') throw new Error('secret authority credential')
        return { kind: 'unavailable', diagnostic: 'offline' }
      }
      const authority: ToolInvokeAuthority<Principal> = {
        qualify: access => (failing ? bad() : real.qualify(access)),
        samePrincipal: access => (failing ? bad() : real.samePrincipal(access)),
      }
      const a = paired(authority)
      const first = accepted(await a.one.invoke(input(dummyRequest())))
      failing = true
      expect(await a.two.invoke(input(dummyRequest()))).toMatchObject({
        kind: 'rejected',
        failure: { kind: 'unavailable' },
      })
      const b = a.source.bindings()[0]
      if (b === undefined) throw new Error('no binding')
      expect(
        await a.source.guard.verify({
          principal: principalA,
          tenant: tenantA,
          call: b.call,
          operation: b.admission,
          request: { ...b.request, invocation: b.invocation },
        }),
      ).toMatchObject({ kind: 'unavailable' })
      failing = false
      expect(accepted(await a.two.invoke(input(dummyRequest()))).reference).toBe(first.reference)
    },
  )
})

it.each(['unknown', 'throw'] as const)(
  'public control allocates independent operations and paired reads preserve each %s result',
  async fault => {
    const a = paired()
    const invoked = accepted(await a.one.invoke(input(dummyRequest())))
    // This commands/reads pair models operation records only. It does not stop an execution.
    const operations = new Map<ToolOperationId, OperationResolution>()
    const control = vi.fn(async (access: Parameters<typeof a.dependencies.commands.control>[0]) => {
      if (operations.size === 0) {
        operations.set(access.operation, { kind: 'unknown' })
        if (fault === 'throw') throw new Error('private control reply lost')
        return fail({ kind: 'commit-unknown', operation: access.operation } as const)
      }
      operations.set(access.operation, {
        kind: 'committed',
        revision: ok(decodeToolRevision('1')),
        receipt: evidence(access.operation),
      })
      return succeed({
        operation: access.operation,
        state: invoked.state,
        progress: { kind: 'pending', diagnostic: 'fixture has no execution control' } as const,
      })
    })
    const runtime = createToolRuntime(
      {
        ...a.dependencies,
        commands: { ...a.dependencies.commands, control },
        reads: {
          ...a.dependencies.reads,
          operation: async access =>
            succeed(operations.get(access.operation) ?? { kind: 'not-committed' }),
        },
      },
      a.configuration,
    ).runtime
    const access = {
      principal: principalA,
      tenant: tenantA,
      reference: invoked.reference,
      intent: { kind: 'stop' } as const,
    }
    const first = await runtime.commands.control(access)
    const second = await runtime.commands.control(access)
    if (first.kind !== 'commit-unknown' || second.kind !== 'committed')
      throw new Error('unexpected control results')
    expect(first.operation).not.toBe(second.operation)
    expect(readToolOperationRef(first.operation).operation).not.toBe(
      readToolOperationRef(second.operation).operation,
    )
    expect(await runtime.queries.queryOperation({ ...access, operation: first.operation })).toEqual(
      succeed({ kind: 'unknown' }),
    )
    expect(
      await runtime.queries.queryOperation({ ...access, operation: second.operation }),
    ).toMatchObject({ ok: { kind: 'committed' } })
    const mint = vi.spyOn(a.dependencies.operationIdentities, 'newOperation')
    for (const intent of [
      { kind: 'withdraw' },
      { kind: 'stop', extra: true },
      { kind: 'withdraw', reach: 'invalid' },
    ])
      expect(await runtime.commands.control({ ...access, intent: intent as never })).toMatchObject({
        kind: 'rejected',
        failure: { kind: 'invalid' },
      })
    const accessor = Object.defineProperty({ ...access }, 'intent', {
      get: () => {
        throw new Error('must not execute getter')
      },
    })
    expect(await runtime.commands.control(accessor)).toMatchObject({
      kind: 'rejected',
      failure: { kind: 'invalid' },
    })
    expect(mint).not.toHaveBeenCalled()
    expect(control).toHaveBeenCalledTimes(2)
  },
)
