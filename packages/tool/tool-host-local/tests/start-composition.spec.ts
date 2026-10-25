import {
  createMemoryToolEnvironment,
  createMemoryToolOutputCustody,
} from '@omne-harness/tool-contract/testing'
// The local start coordinator under the real Tool runtime, ledger and driver, over one
// non-durable store: the call domain, the queue domain and the coordinator's host domain. The
// binding stages a capsule and consumes its permit through the coordinator, as P04 requires of
// the trusted execution boundary.
import { fail, succeed } from '@omne-harness/operation-result'
import { describe, expect, it } from 'vitest'
import { createToolLedger, createToolRuntime, type ToolLedgerStore } from '@omne-harness/tool'
import {
  createTestInvocationSource,
  createTestToolIdentities,
  createMemoryToolLedgerStore,
} from '@omne-harness/tool/testing'
import { type ToolInvocationRef, type ToolState } from '@omne-harness/tool-contract'
import {
  defaultResultPolicy,
  readToolInvocationRef,
  type ToolDriver,
  type ToolExecutorBinding,
  type ToolLiveExecution,
  type ToolMessageContentBlock,
} from '@omne-harness/tool-contract/provider'
import {
  access,
  coordinator,
  evidence,
  instanceId,
  operationId,
  permission,
  principalA,
  request,
  tenantA,
  type Principal,
} from './coordinator-values.ts'

type Block = ToolMessageContentBlock

function rejecting<T extends object>(methods: readonly string[]): T {
  const out: Record<string, unknown> = {}
  for (const method of methods)
    out[method] = () => Promise.reject(new Error(`${method} is not on the way to a start`))
  // Every method rejects, so the object has the port's shape at run time.
  return out as T
}

function liveExecution(): ToolLiveExecution<Block> {
  const later = () => Promise.reject(new Error('not read here'))
  return {
    facts: () => ({
      [Symbol.asyncIterator]: () => ({
        next: () => Promise.resolve({ done: true, value: undefined }),
      }),
    }),
    acknowledge: later,
    stop: later,
    inspectControl: later,
    answer: later,
    inspectAnswer: later,
  }
}

/**
 * The runtime of one call `c1`, with a binding whose start runs `beforeConsume` between staging
 * the capsule and consuming the permit, the moment an invalidation can still win.
 */
function assembly(
  options: Readonly<{
    beforeConsume?: () => Promise<void>
    store?: (memory: ToolLedgerStore<Block>) => ToolLedgerStore<Block>
  }> = {},
) {
  const memory = createMemoryToolLedgerStore<Block>()
  const store = options.store === undefined ? memory : options.store(memory)
  const authority = coordinator(store)
  const identities = createTestToolIdentities()
  const source = createTestInvocationSource<Principal>({
    snapshotPrincipal: principal => ({
      subject: principal.subject,
      tenants: [...principal.tenants],
    }),
    authority: {
      qualify: async input =>
        input.tenant === tenantA &&
        input.principal.subject === principalA.subject &&
        input.consumer.owner === 'consumer'
          ? { kind: 'allowed' }
          : { kind: 'denied', reason: 'not-qualified' },
      samePrincipal: async ({ current, original }) =>
        current.subject === original.subject
          ? { kind: 'allowed' }
          : { kind: 'denied', reason: 'different-subject' },
    },
  })
  const starts: string[] = []
  const executions: string[] = []
  const binding: ToolExecutorBinding<Principal, Block, null> = {
    kind: 'live-only',
    start: async input => {
      starts.push(input.call)
      await options.beforeConsume?.()
      const consumed = await authority.consume({
        principal: input.principal,
        tenant: input.tenant,
        call: input.call,
        permit: input.permit,
        executorReceipt: evidence(`capsule-${input.call}`),
      })
      if ('failure' in consumed) return consumed
      if (consumed.ok.kind !== 'started')
        return fail({ kind: 'unavailable', dependency: 'executor', diagnostic: consumed.ok.kind })
      executions.push(input.call)
      return succeed(liveExecution())
    },
    inspectStart: () => Promise.reject(new Error('recovery')),
  }
  const ledger = createToolLedger<Principal, Block>(
    store,
    {
      access: { qualify: input => access().qualify({ ...input, action: 'start' }) },
      sources: source.guard,
      factAcknowledgements: {
        verify: () => Promise.resolve({ kind: 'unavailable', diagnostic: 'start-only fixture' }),
      },
      grants: new Map([
        ['scope-owner', { verifyGrant: () => Promise.resolve({ kind: 'granted' }) }],
      ]),
      starts: { qualifyStart: () => Promise.resolve({ kind: 'allowed' }) },
      results: {
        text: value =>
          succeed({
            content: [
              {
                kind: 'text',
                id: 'b0' as never,
                visibility: { toHuman: true, toModel: true },
                text: value,
              },
            ],
            data: { kind: 'none' },
            original: { kind: 'none' },
            attachments: [],
          }),
      },
      policy: defaultResultPolicy,
      budgets: {
        arguments: {
          maxBytes: 4_096,
          maxDepth: 16,
          maxItems: 256,
          maxMembers: 64,
          maxStringLength: 1_024,
          maxNumberLength: 32,
        },
      },
    },
    {
      now: () => '2026-10-17T00:00:00.000Z',
      begin: input =>
        Promise.resolve(
          succeed({
            operation: input.operation,
            source: 'clock',
            epoch: 'e1',
            marker: evidence('segment'),
          }),
        ),
      elapsed: () => Promise.reject(new Error('timing')),
      waitUntil: () => Promise.reject(new Error('timing')),
    },
    { resultPageBytes: 4_096, ledgerCommitAttempts: 8, queueCapacity: 8 },
    testSettlementPorts(),
  )
  let driver: ToolDriver<Principal> | null = null
  const { runtime } = createToolRuntime<Principal, Block, null>(
    {
      operationIdentities: identities.operationIdentities,
      sourceIssuer: source.issuer,
      commands: ledger.commands,
      admissions: ledger.admissions,
      queues: ledger.queues,
      facts: ledger.facts,
      reads: ledger.reads,
      bindings: {
        inspect: () => Promise.reject(new Error('catalog')),
        resolve: () => Promise.resolve(succeed(binding)),
        recover: () => Promise.reject(new Error('recovery')),
      },
      environments: {
        prepare: input =>
          Promise.resolve(
            succeed({
              kind: 'prepared',
              environment: {
                value: null,
                evidence: evidence('environment'),
                preparation: input.preparation,
              },
            }),
          ),
        inspectPreparation: () => Promise.reject(new Error('the prepared value is kept')),
        release: () => Promise.reject(new Error('release')),
        inspectRelease: () => Promise.reject(new Error('release')),
      },
      decisions: rejecting(['inspectOperation', 'ensure', 'inspect', 'invalidate', 'resolve']),
      instances: {
        ...rejecting<{ publish: never; withdraw: never }>(['publish', 'withdraw']),
        directory: rejecting(['connect']),
        install: installed => {
          driver = installed
          return { release: () => Promise.resolve() }
        },
        schedule: () => Promise.resolve(succeed({ queued: true } as const)),
      },
      clock: rejecting(['now', 'begin', 'elapsed', 'waitUntil']),
      resultPolicy: defaultResultPolicy,
      authority,
      resources: rejecting([
        'inspectOperation',
        'ensure',
        'inspect',
        'expire',
        'invalidate',
        'resolve',
      ]),
      custody: rejecting(['preserve', 'inspect', 'retainResult']),
      catalog: rejecting(['inspect', 'usage', 'search']),
      children: rejecting(['reserve', 'admitted', 'retain', 'close', 'confirmBarrier']),
    },
    {
      authorBufferBytes: 4_096,
      authorBufferItems: 16,
      authorWaitHistoryBytes: 65_536,
      authorWaitHistoryItems: 8,
      processBatchBytes: 4_096,
      processBatchDelayMs: 0,
      observerBufferBytes: 65_536,
      resultPageBytes: 4_096,
      reconciliationDelayMs: 0,
      ledgerCommitAttempts: 8,
      queueCapacity: 8,
    },
  )
  let reference: ToolInvocationRef | undefined
  const call = () => {
    if (reference === undefined) throw new Error('not admitted')
    return { principal: principalA, tenant: tenantA, call: readToolInvocationRef(reference).call }
  }
  const admit = async () => {
    const { invocation: _invocation, ...payload } = request()
    const outcome = await runtime.invoke({
      principal: principalA,
      tenant: tenantA,
      request: payload,
    })
    if (outcome.kind === 'accepted' || outcome.kind === 'commit-unknown')
      reference = outcome.reference
    return outcome
  }
  const run = async () => {
    if (driver === null) throw new Error('no driver installed')
    await driver.run({ ...call(), instance: instanceId, signal: new AbortController().signal })
  }
  const state = async (): Promise<ToolState> => {
    const found = await runtime.queries.lookup({
      principal: principalA,
      tenant: tenantA,
      reference:
        reference ??
        (() => {
          throw new Error('not admitted')
        })(),
    })
    if (!('ok' in found) || found.ok.kind !== 'found') throw new Error('c1 was not admitted')
    return found.ok.state
  }
  const invalidate = () =>
    authority.invalidate({
      principal: principalA,
      tenant: tenantA as never,
      operation: operationId('revoke-1'),
      guard: { ...permission, revision: '0', evidence: evidence('g'), scope: { kind: 'resource' } },
    })
  return { admit, run, state, invalidate, starts, executions, authority, call }
}

describe('G5 under the runtime', () => {
  it('G5 composition: an invalidation before the acceptance settles the call unavailable, never started', async () => {
    let invalidate: (() => Promise<unknown>) | null = null
    const harness = assembly({
      beforeConsume: async () => {
        await invalidate?.()
      },
    })
    invalidate = harness.invalidate
    await harness.admit()
    await harness.run()
    expect(harness.starts).toEqual([harness.call().call])
    expect(harness.executions).toEqual([])
    expect(await harness.state()).toMatchObject({
      phase: 'settled',
      terminal: {
        kind: 'unavailable',
        reason: expect.stringContaining('invalidated before the start'),
      },
      effect: { kind: 'not-started' },
      execution: { kind: 'not-started' },
      queue: { kind: 'released' },
    })
  })

  it('G5 composition: an acceptance before the invalidation is a start in flight', async () => {
    const harness = assembly()
    await harness.admit()
    await harness.run()
    await harness.invalidate()
    await harness.run()
    expect(harness.executions).toEqual([harness.call().call])
    expect(await harness.state()).toMatchObject({ phase: 'running', execution: { kind: 'live' } })
  })

  it('G5 composition: a lost recordStart answer is recovered from the coordinator, and the binding starts once', async () => {
    let lose = true
    const harness = assembly({
      store: memory => ({
        durability: 'none',
        read: domain => memory.read(domain),
        commit: input => {
          if (
            lose &&
            input.writes.some(
              write =>
                write.kind === 'put' &&
                write.record.kind === 'operation' &&
                write.record.operation.operation.endsWith('/started'),
            )
          ) {
            lose = false
            return Promise.resolve({ kind: 'unavailable', diagnostic: 'the store is down' })
          }
          return memory.commit(input)
        },
      }),
    })
    await harness.admit()
    await harness.run()
    expect((await harness.state()).phase).toBe('starting')
    await harness.run()
    expect(harness.starts).toEqual([harness.call().call])
    expect(harness.executions).toEqual([harness.call().call])
    expect((await harness.state()).phase).toBe('running')
  })
})

function testSettlementPorts() {
  return {
    content: null,
    custody: createMemoryToolOutputCustody<Principal>(),
    releaseInspection: createMemoryToolEnvironment<Principal>(),
  }
}
