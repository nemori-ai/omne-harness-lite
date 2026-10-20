import { describe, expect, it } from 'vitest'
import { succeed } from '@omne-harness/operation-result'
import { createToolRuntime } from '@omne-harness/tool'
import { createTestToolDependencies } from '@omne-harness/tool/testing'
import {
  decodeToolResultVersion,
  type ToolInvokeOutcome,
  type ToolStartRecord,
} from '@omne-harness/tool-contract'
import { completedFinal } from '@omne-harness/tool-contract/testing'
import { testAssembly } from './testing-values.ts'
import {
  adoption,
  callId,
  dummyRequest,
  evidence,
  fixedRequestForNamedSourceGuard,
  instanceId,
  ok,
  operationId,
  principalA,
  principalB,
  referenceFor,
  request,
  tenantA,
  tenantB,
} from './runtime-values.ts'

const access = { principal: principalA, tenant: tenantA, call: callId('call-1') }

function resolvingAssembly() {
  return testAssembly({
    bindingsFor: executor => ({
      inspect: () => Promise.resolve(succeed(request().availability)),
      resolve: () => Promise.resolve(succeed(executor)),
      recover: () => {
        throw new Error('not on this path')
      },
    }),
  })
}

function accepted(outcome: ToolInvokeOutcome) {
  if (outcome.kind !== 'accepted') throw new Error(`expected accepted: ${JSON.stringify(outcome)}`)
  return outcome
}

describe('18 testing dependency assembly', () => {
  it('18 creates dependencies without installing or scheduling and installs once on runtime construction', () => {
    const assembly = testAssembly()
    let installs = 0
    const { instances } = assembly.dependencies
    const inputHost = {
      ...instances,
      install: (driver: Parameters<typeof instances.install>[0]) => {
        installs += 1
        return instances.install(driver)
      },
    }
    const fresh = testAssembly({ instances: inputHost })
    expect(installs).toBe(0)
    expect(fresh.store.reads + fresh.store.commits).toBe(0)
    expect(() => assembly.host.driver()).toThrow('no driver was installed')
    createToolRuntime(fresh.dependencies, fresh.configuration)
    expect(installs).toBe(1)
    expect(typeof assembly.host.driver().run).toBe('function')
    expect(assembly.host.scheduled).toEqual([])
    expect(fresh.store.reads + fresh.store.commits).toBe(0)
  })

  it('18 constructs bindings once and passes the same recovery owner to the runtime assembly', () => {
    let constructions = 0
    const bindings = {
      inspect: () => Promise.resolve(succeed(request().availability)),
      resolve: () => Promise.reject(new Error('unused')),
      recover: () => Promise.reject(new Error('unused')),
    }
    const assembly = testAssembly({
      bindingsFor: () => {
        constructions += 1
        return bindings
      },
    })
    expect(constructions).toBe(1)
    expect(assembly.dependencies.bindings).toBe(bindings)
  })

  it('18 hands the executor to the caller resolver and keeps the original controls on that executor', async () => {
    const assembly = resolvingAssembly()
    const binding = ok(
      await assembly.dependencies.bindings.resolve({
        ...access,
        request: fixedRequestForNamedSourceGuard(),
      }),
    )
    expect(binding).toBe(assembly.doubles.executor.binding)
    const start: Extract<ToolStartRecord, { kind: 'start' }> = {
      kind: 'start',
      operation: operationId('start-1'),
      executor: adoption('exec'),
      execution: { tenant: tenantA, call: access.call, instance: instanceId, generation: '1' },
    }
    const permit = {
      tenant: tenantA,
      call: access.call,
      operation: start.operation,
      adoption: adoption('permit'),
      inputDigest: 'test-digest',
      start,
      guards: [],
      request: evidence('permit'),
    }
    ok(
      await binding.start(
        { ...access, start, permit, request: fixedRequestForNamedSourceGuard() },
        {
          resource: 'test',
        },
      ),
    )
    expect(assembly.doubles.executor.controls.launches()).toBe(1)
    expect(ok(await binding.inspectStart({ ...access, start })).kind).toBe('live')
    await assembly.doubles.executor.controls.finish(start, completedFinal())
    expect(ok(await binding.inspectStart({ ...access, start })).kind).toBe('settled')
    const other = resolvingAssembly()
    expect(other.doubles.executor.controls.launches()).toBe(0)
    const otherBinding = ok(
      await other.dependencies.bindings.resolve({
        ...access,
        request: fixedRequestForNamedSourceGuard(),
      }),
    )
    expect(ok(await otherBinding.inspectStart({ ...access, start })).kind).toBe('not-started')
  })

  it('18 returns original port handles and isolates clock state and store faults between assemblies', async () => {
    const a = testAssembly()
    const b = createTestToolDependencies(a.input)
    expect(a.durability).toBe('none')
    expect(a.dependencies.environments).toBe(a.doubles.environment)
    expect(a.dependencies.authority).toBe(a.doubles.authority)
    expect(a.dependencies.decisions).toBe(a.doubles.decisions)
    expect(a.dependencies.resources).toBe(a.doubles.resources)
    expect(a.dependencies.custody).toBe(a.doubles.custody)
    const before = b.dependencies.clock.now()
    const signal = new AbortController().signal
    const waiting = a.dependencies.clock.waitUntil(
      a.doubles.clock.controls.instantAfter(10),
      signal,
    )
    a.doubles.clock.controls.advance(10)
    expect(await waiting).toBe('elapsed')
    expect(a.dependencies.clock.now()).not.toBe(before)
    expect(b.dependencies.clock.now()).toBe(before)
    const ra = createToolRuntime(a.dependencies, a.configuration).runtime
    const rb = createToolRuntime(b.dependencies, a.configuration).runtime
    const reference = referenceFor('call-1', 'op-1')
    a.store.injectRead('unavailable')
    expect(
      await ra.queries.lookup({ principal: principalA, tenant: tenantA, reference }),
    ).toMatchObject({
      failure: { kind: 'unavailable' },
    })
    expect(
      ok(await rb.queries.lookup({ principal: principalA, tenant: tenantA, reference })).kind,
    ).toBe('not-accepted')
    accepted(await ra.invoke({ principal: principalA, tenant: tenantA, request: dummyRequest() }))
    expect(
      ok(await rb.queries.lookup({ principal: principalA, tenant: tenantA, reference })).kind,
    ).toBe('not-accepted')
  })

  it('18 runs logical admission, lookup and result reads with caller-owned tenant qualification', async () => {
    const assembly = testAssembly()
    const { runtime } = createToolRuntime(assembly.dependencies, assembly.configuration)
    const admitted = accepted(
      await runtime.invoke({ principal: principalA, tenant: tenantA, request: dummyRequest() }),
    )
    expect(
      ok(
        await runtime.queries.lookup({
          principal: principalA,
          tenant: tenantA,
          reference: admitted.reference,
        }),
      ),
    ).toEqual({
      kind: 'found',
      state: admitted.state,
    })
    const result = ok(decodeToolResultVersion('v1'))
    expect(
      ok(
        await runtime.queries.readResult({
          principal: principalA,
          tenant: tenantA,
          reference: admitted.reference,
          result,
          after: null,
        }),
      ).value.content.length,
    ).toBeGreaterThan(0)
    const other = { principal: principalB, tenant: tenantB }
    expect(await runtime.queries.lookup({ ...other, reference: admitted.reference })).toMatchObject(
      { failure: { kind: 'denied', action: 'lookup' } },
    )
    const otherAdmitted = accepted(await runtime.invoke({ ...other, request: dummyRequest() }))
    expect(
      ok(await runtime.queries.lookup({ ...other, reference: otherAdmitted.reference })),
    ).toMatchObject({ kind: 'found' })
    const reads = assembly.store.reads
    expect(
      await runtime.queries.lookup({
        principal: principalA,
        tenant: tenantB,
        reference: otherAdmitted.reference,
      }),
    ).toMatchObject({ failure: { kind: 'denied', action: 'lookup' } })
    expect(assembly.store.reads).toBe(reads)
  })

  it('18 propagates invalid ledger configuration and caller resolver exceptions', () => {
    expect(() =>
      testAssembly({
        configuration: { resultPageBytes: 0, ledgerCommitAttempts: 1, queueCapacity: 1 },
      }),
    ).toThrow('configuration.resultPageBytes: range')
    const failure = new Error('resolver failed')
    expect(() =>
      testAssembly({
        bindingsFor: () => {
          throw failure
        },
      }),
    ).toThrow(failure)
  })
})
