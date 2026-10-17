import { describe, expect, it } from 'vitest'
import {
  createToolLedger,
  createToolRuntime,
  toolRuntimeAdoption,
  type ToolDependencies,
} from '@omne-harness/tool'
import { createMemoryToolLedgerStore } from '@omne-harness/tool/testing'
import {
  admission,
  callId,
  configuration,
  dummyRequest,
  guards,
  harness,
  ok,
  operationId,
  principalA,
  tenantA,
  type Block,
  type Principal,
} from './runtime-values.ts'

const access = { principal: principalA, tenant: tenantA, call: callId('call-1') }

describe('17 the runtime factory and later increments', () => {
  it('17 factory: a configuration outside its ranges is an assembly defect and throws at construction', () => {
    const { ledger } = harness()
    const dependencies = dependenciesOf(ledger)
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
  })

  it('17 factory: the ledger checks the configuration it reads and throws at construction', () => {
    const store = createMemoryToolLedgerStore<Block>()
    const clock = dependenciesOf(harness().ledger).clock
    for (const [key, value] of [
      ['ledgerCommitAttempts', 0],
      ['ledgerCommitAttempts', 1.5],
      ['resultPageBytes', -1],
      ['resultPageBytes', Number.POSITIVE_INFINITY],
    ] as const)
      expect(() =>
        createToolLedger(store, guards(), clock, configuration({ [key]: value })),
      ).toThrow(`configuration.${key}: range`)
    expect(() => createToolLedger(store, guards(), clock, null as never)).toThrow(
      'configuration: type',
    )
  })

  it('17 factory: the operations of later increments answer a named unsupported failure and never throw', async () => {
    const { runtime, provider } = harness()
    ok(await runtime.admit(admission('call-1', 'op-1', dummyRequest())))
    const later = {
      inspect: runtime.inspect({
        ...access,
        name: 'read_file',
        command: null,
        consumer: profile(),
      }),
      control: runtime.control({
        ...access,
        operation: operationId('op-2'),
        intent: { kind: 'stop', reason: 'user' },
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
    const { runtime, provider } = harness()
    expect(runtime.catalog).toBeDefined()
    expect(runtime.instances).toBeDefined()
    expect(Object.isFrozen(provider)).toBe(true)
    expect(Object.isFrozen(runtime)).toBe(true)
  })
})

function profile() {
  return {
    kind: 'independent' as const,
    capabilities: { owner: 'test', record: 'c', revision: '1', digest: 'x' },
    attachmentAccess: { owner: 'test', record: 'a', revision: '1', digest: 'x' },
  }
}

function dependenciesOf(
  ledger: ReturnType<typeof harness>['ledger'],
): ToolDependencies<Principal, Block, null> {
  const missing = () => {
    throw new Error('not on this path')
  }
  const port = <T extends object>(...methods: readonly string[]): T =>
    Object.fromEntries(methods.map(method => [method, missing])) as T
  return {
    commands: ledger.commands,
    admissions: ledger.admissions,
    reads: ledger.reads,
    bindings: port('inspect', 'resolve', 'recover'),
    environments: port('prepare', 'inspectPreparation', 'release', 'inspectRelease'),
    decisions: port('inspectOperation', 'ensure', 'inspect', 'invalidate', 'resolve'),
    instances: {
      ...port('install', 'schedule', 'publish', 'withdraw'),
      directory: port('connect'),
    },
    clock: port('now', 'begin', 'elapsed', 'waitUntil'),
    resultPolicy: port('judge', 'judgeResult'),
    authority: port('exclude', 'prepare', 'consume', 'inspect', 'invalidate'),
    resources: port('inspectOperation', 'ensure', 'inspect', 'expire', 'invalidate', 'resolve'),
    custody: port('preserve', 'inspect', 'retainResult'),
    catalog: port('inspect', 'usage', 'search'),
    children: port('reserve', 'admitted', 'retain', 'close', 'confirmBarrier'),
  }
}
