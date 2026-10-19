import { describe, expect, it } from 'vitest'
import { createToolLedger, createToolRuntime, toolRuntimeAdoption } from '@omne-harness/tool'
import { createMemoryToolLedgerStore } from '@omne-harness/tool/testing'
import type { ToolConsumerProfile } from '@omne-harness/tool-contract'
import {
  admission,
  callId,
  configuration,
  dummyRequest,
  guards,
  ok,
  operationId,
  principalA,
  tenantA,
  type Block,
} from './runtime-values.ts'
import { testAssembly } from './testing-values.ts'

const access = { principal: principalA, tenant: tenantA, call: callId('call-1') }

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

  it('17 factory: the operations of later increments answer a named unsupported failure and never throw', async () => {
    const { runtime, provider } = factoryHarness()
    ok(await runtime.admit(admission('call-1', 'op-1', dummyRequest())))
    const later = {
      control: runtime.control({
        ...access,
        operation: operationId('op-2'),
        intent: { kind: 'stop' },
      }),
      readProcess: runtime.readProcess({ ...access, at: null }),
      readWait: runtime.readWait({ ...access, wait: 'w1' as never }),
      readDiagnostics: runtime.readDiagnostics({ ...access, after: null }),
      acceptDecision: runtime.acceptDecision({
        ...access,
        operation: operationId('op-2'),
        wait: 'w1' as never,
        decision: { owner: 'hitl', record: 'd', revision: '1', digest: 'x' },
      }),
      recover: provider.recover({ principal: principalA, tenant: tenantA }),
      quiesce: provider.quiesce(),
      inspectDrain: provider.inspectDrain({ principal: principalA, tenant: tenantA }),
      contentRead: runtime.content.read({
        ...access,
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
        { failure: { kind: 'unsupported', reason: expect.stringContaining('not implemented') } },
      ])
      // The runtime names itself; content.read is answered by the ledger, which names itself.
      if ('failure' in answer && answer.failure.kind === 'unsupported')
        expect([toolRuntimeAdoption.name, 'tool-ledger']).toContain(answer.failure.adoption.name)
    }
  })

  it('17 factory: the catalog and the instance directory are the dependencies, not copies', () => {
    const { runtime, provider, dependencies } = factoryHarness()
    expect(runtime.catalog).toBe(dependencies.catalog)
    expect(runtime.instances).toBe(dependencies.instances.directory)
    expect(Object.isFrozen(provider)).toBe(true)
    expect(Object.isFrozen(runtime)).toBe(true)
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

  it('17 factory: an instance identity that is not one is an assembly defect', () => {
    const dependencies = testAssembly().dependencies
    expect(() =>
      createToolRuntime({ ...dependencies, instance: '' as never }, configuration()),
    ).toThrow('dependencies.instance: not-an-instance-id')
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
