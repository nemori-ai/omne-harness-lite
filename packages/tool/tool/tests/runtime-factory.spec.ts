import { describe, expect, it } from 'vitest'
import { createToolLedger, createToolRuntime, toolRuntimeAdoption } from '@omne-harness/tool'
import { createMemoryToolLedgerStore } from '@omne-harness/tool/testing'
import type {
  ToolConsumerProfile,
  ToolDirectory,
  ToolInvokeOutcome,
} from '@omne-harness/tool-contract'
import {
  callId,
  configuration,
  dummyRequest,
  guards,
  principalA,
  referenceFor,
  tenantA,
  type Block,
} from './runtime-values.ts'
import { testAssembly } from './testing-values.ts'

const access = { principal: principalA, tenant: tenantA, call: callId('call-1') }

function accepted(outcome: ToolInvokeOutcome) {
  if (outcome.kind !== 'accepted') throw new Error(`expected accepted: ${JSON.stringify(outcome)}`)
  return outcome
}

describe('17 the runtime factory and later increments', () => {
  it('17 factory: a configuration outside its ranges is an assembly defect and throws at construction', () => {
    const { dependencies } = testAssembly()
    expect(() => createToolRuntime(dependencies, configuration({ resultPageBytes: 0 }))).toThrow(
      'configuration.resultPageBytes: range',
    )
    expect(() =>
      createToolRuntime(dependencies, configuration({ processBatchDelayMs: -1 })),
    ).toThrow('configuration.processBatchDelayMs: range')
    expect(() =>
      createToolRuntime(dependencies, configuration({ authorBufferItems: 1.5 })),
    ).toThrow('configuration.authorBufferItems: range')
    expect(() =>
      createToolRuntime({ ...dependencies, clock: undefined as never }, configuration()),
    ).toThrow('dependencies.clock: missing')
    expect(() =>
      createToolRuntime({ ...dependencies, admissions: undefined as never }, configuration()),
    ).toThrow('dependencies.admissions: missing')
    expect(() =>
      createToolRuntime(dependencies, configuration({ ledgerCommitAttempts: 0 })),
    ).toThrow('configuration.ledgerCommitAttempts: range')
    for (const steps of [0, -1, 1.5, Number.POSITIVE_INFINITY, '16', null])
      expect(
        () => createToolRuntime(dependencies, configuration({ driverStepsPerRun: steps as never })),
        String(steps),
      ).toThrow('configuration.driverStepsPerRun: range')
    expect(() =>
      createToolRuntime(dependencies, configuration({ driverStepsPerRun: 1 })),
    ).not.toThrow()
    expect(() =>
      createToolRuntime({ ...dependencies, queues: undefined as never }, configuration()),
    ).toThrow('dependencies.queues: missing')
  })

  it('17 factory: the retry delay of a failed driver run is an integer from 1 to what a timer holds, and absent takes the default', () => {
    const dependencies = testAssembly().dependencies
    // 0 would run a failing call in a tight loop; above 2147483647 a timer fires after 1 ms.
    for (const delay of [
      -1,
      0,
      1.5,
      2_147_483_648,
      3_000_000_000,
      Number.POSITIVE_INFINITY,
      Number.NaN,
      '1000',
      null,
    ])
      expect(
        () =>
          createToolRuntime(dependencies, configuration({ driverRetryDelayMs: delay as never })),
        String(delay),
      ).toThrow('configuration.driverRetryDelayMs: range')
    for (const delay of [1, 60_000, 2_147_483_647])
      expect(() =>
        createToolRuntime(dependencies, configuration({ driverRetryDelayMs: delay })),
      ).not.toThrow()
    expect(() => createToolRuntime(dependencies, configuration())).not.toThrow()
  })

  it('17 factory: the ledger checks the configuration it reads and throws at construction', () => {
    const store = createMemoryToolLedgerStore<Block>()
    const clock = testAssembly().dependencies.clock
    for (const [key, value] of [
      ['ledgerCommitAttempts', 0],
      ['ledgerCommitAttempts', 1.5],
      ['resultPageBytes', -1],
      ['resultPageBytes', Number.POSITIVE_INFINITY],
      ['queueCapacity', 0],
      ['queueCapacity', 2.5],
    ] as const)
      expect(() =>
        createToolLedger(store, guards(), clock, configuration({ [key]: value })),
      ).toThrow(`configuration.${key}: range`)
    expect(() => createToolLedger(store, guards(), clock, null as never)).toThrow(
      'configuration: type',
    )
  })

  it('17 factory: the trusted construction ports are required at construction', () => {
    const { dependencies } = testAssembly()
    expect(() =>
      createToolRuntime(
        { ...dependencies, invocationIdentities: undefined as never },
        configuration(),
      ),
    ).toThrow('dependencies.invocationIdentities: missing')
    expect(() =>
      createToolRuntime(
        { ...dependencies, operationIdentities: undefined as never },
        configuration(),
      ),
    ).toThrow('dependencies.operationIdentities: missing')
    expect(() =>
      createToolRuntime({ ...dependencies, sourceIssuer: undefined as never }, configuration()),
    ).toThrow('dependencies.sourceIssuer: missing')
  })

  it('17 factory: the operations of later increments answer a named unsupported failure and never throw', async () => {
    const { runtime, provider } = factoryHarness()
    accepted(
      await runtime.invoke({ principal: principalA, tenant: tenantA, request: dummyRequest() }),
    )
    const reference = referenceFor('call-1', 'op-1')
    const later = {
      control: runtime.commands.control({ ...access, reference, intent: { kind: 'stop' } }),
      readProcess: runtime.queries.readProcess({ ...access, reference, at: null }),
      readWait: runtime.queries.readWait({ ...access, reference, wait: 'w1' as never }),
      readDiagnostics: runtime.queries.readDiagnostics({ ...access, reference, after: null }),
      recover: provider.recover({ principal: principalA, tenant: tenantA }),
      quiesce: provider.quiesce(),
      inspectDrain: provider.inspectDrain({ principal: principalA, tenant: tenantA }),
      contentRead: runtime.content.read({
        ...access,
        reference,
        result: 'v1' as never,
        attachment: { storage: 's', key: 'k', mediaType: 'text/plain', bytes: '1', digest: 'x' },
        after: null,
        maxBytes: 16,
      }),
    }
    for (const [name, probe] of Object.entries(later)) {
      const answer = await probe
      expect([name, answer]).toMatchObject([
        name,
        name === 'control'
          ? {
              kind: 'rejected',
              failure: { kind: 'unsupported', reason: expect.stringContaining('not implemented') },
            }
          : {
              failure: { kind: 'unsupported', reason: expect.stringContaining('not implemented') },
            },
      ])
      // The runtime names itself; content.read is answered by the ledger, which names itself.
      const failure =
        name === 'control'
          ? ((answer as { failure?: { kind: string; adoption?: { name: string } } }).failure ??
            (answer as { failure?: never }).failure)
          : (answer as { failure?: { kind: string; adoption?: { name: string } } }).failure
      if (failure?.kind === 'unsupported' && failure.adoption !== undefined)
        expect([toolRuntimeAdoption.name, 'tool-ledger']).toContain(failure.adoption.name)
    }
  })

  it('17 factory: the catalog is the dependency, and the directory access resolves through it', async () => {
    const { runtime, provider, dependencies } = factoryHarness()
    expect(runtime.catalog).toBe(dependencies.catalog)
    expect(Object.isFrozen(provider)).toBe(true)
    expect(Object.isFrozen(runtime)).toBe(true)
    accepted(
      await runtime.invoke({ principal: principalA, tenant: tenantA, request: dummyRequest() }),
    )
    const connected: unknown[] = []
    const directory: ToolDirectory<typeof principalA> = {
      connect: input => {
        connected.push(input)
        return Promise.resolve({ ok: { kind: 'no-live-route' as const } })
      },
    }
    const withDirectory = createToolRuntime(
      {
        ...dependencies,
        instances: { ...dependencies.instances, directory },
      },
      configuration(),
    )
    const answer = await withDirectory.runtime.instances.connect({
      principal: principalA,
      tenant: tenantA,
      reference: referenceFor('call-1', 'op-1'),
    })
    expect(answer).toEqual({ ok: { kind: 'no-live-route' } })
    expect(connected).toEqual([
      { principal: principalA, tenant: tenantA, call: callId('call-1'), admission: 'op-1' },
    ])
  })

  it('17 factory: inspect answers what the Catalog answers, its unavailability included', async () => {
    const { dependencies } = testAssembly()
    const answer = {
      failure: { kind: 'unavailable', dependency: 'toolCatalog', diagnostic: 'withdrawn' },
    } as const
    const asked: unknown[] = []
    const catalog = {
      ...dependencies.catalog,
      inspect: (input: unknown) => {
        asked.push(input)
        return Promise.resolve(answer)
      },
    }
    const { runtime } = createToolRuntime({ ...dependencies, catalog }, configuration())
    const input = { ...access, name: 'read_file', command: null, consumer: profile() }
    expect(await runtime.inspect(input)).toEqual(answer)
    expect(asked).toEqual([input])
  })

  it('17 factory: the driver is installed on the instance host at construction, and nothing runs', () => {
    const { host, store } = factoryHarness()
    expect(typeof host.driver().run).toBe('function')
    expect(host.scheduled).toEqual([])
    expect(store.commits + store.reads).toBe(0)
  })
})

function profile(): ToolConsumerProfile {
  return {
    conversion: null,
    capabilities: { owner: 'test', record: 'c', revision: '1', digest: 'x' },
    attachmentAccess: { owner: 'test', record: 'a', revision: '1', digest: 'x' },
  }
}

function factoryHarness() {
  const assembly = testAssembly()
  const provider = createToolRuntime(assembly.dependencies, assembly.configuration)
  return { ...assembly, provider, runtime: provider.runtime }
}
