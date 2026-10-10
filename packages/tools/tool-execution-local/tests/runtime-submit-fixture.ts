import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, vi } from 'vitest'
import type { JsonValue } from '@omne-harness-lite/content-blocks'
import type { RecoveryAccess } from '@omne-harness-lite/execution-environments'
import { parseOpaqueIdentifier, parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import type { RunnerReadScope } from '@omne-harness-lite/loop-extension-runner'
import { instantFromEpochMs, instantFromRfc3339 } from '@omne-harness-lite/offer-expiry'
import type {
  ToolActionFacts,
  ToolActionHistoryOperations,
} from '@omne-harness-lite/tool-admission'
import {
  createParameterJudge,
  isToolReturn,
  toolResultOf,
  type ToolDefinition,
} from '@omne-harness-lite/tool-definition'
import {
  projectToolJournal,
  type ExecutionObserver,
  type ExecutionSubmission,
  type ExecutionTerminal,
  type ToolExecutor,
  type ToolResultWriter,
  type ToolRuntimeDependencies,
} from '@omne-harness-lite/tool-execution-runtime'
import {
  createToolImplementationRegistry,
  createToolInvoker,
  createToolRuntime,
} from '../src/index.ts'
import { access, at, definition, deferred, ref, request, scope } from './execution-owner-fixture.ts'
import { factoryConfig } from './runtime-factory-fixture.ts'
import { openSqlLogFixture } from './sql-log-fixture.ts'

export { access, at, deferred, ref, scope }
export const pass = `tool-after-${createHash('sha256')
  .update(JSON.stringify([scope.tenant, scope.session, request.origin, ref.callId]))
  .digest('hex')}`
export const extension = {
  name: 'example:after',
  position: 'after_action',
  dimension: { scope: 'each' },
  power: 'observe',
  implementation: { kind: 'builtin', builtinName: 'example:after' },
} as const
export const selectedChain = [{ definition: extension, power: 'observe' }]

export function chainHead(
  nonempty = false,
): Awaited<ReturnType<RunnerReadScope['sources']['manifest']['readHead']>> {
  const root = { category: 'agent_definition', name: 'example:root' } as const
  const capability = { category: 'loop_extension', name: extension.name } as const
  const tuple = { capability, asset: 'ast_after', version: 1, from: 'factory' }
  const record = {
    session: scope.session,
    seq: 1,
    evaluation: {
      kind: 'given',
      ref: unwrap(parseOpaqueIdentifier('evaluation_one', 'EvaluationRef')),
    } as const,
    evaluationRef: unwrap(parseOpaqueIdentifier('evaluation_one', 'EvaluationRef')),
    tables: {
      loop_extension: {
        filledAt: unwrap(instantFromEpochMs(1)),
        composition: nonempty ? [tuple] : [],
      },
      mcp: { filledAt: unwrap(instantFromEpochMs(1)), composition: [] },
      plugin: { filledAt: unwrap(instantFromEpochMs(1)), composition: [] },
      skill: { filledAt: unwrap(instantFromEpochMs(1)), composition: [] },
      slash_command: { filledAt: unwrap(instantFromEpochMs(1)), composition: [] },
      tool: { filledAt: unwrap(instantFromEpochMs(1)), composition: [] },
    },
    content: {
      evaluation: {
        root,
        assets: [
          { capability: root, asset: 'ast_root', version: 1, from: 'factory', replaced: [] },
          ...(nonempty ? [{ ...tuple, replaced: [] }] : []),
        ],
        composition: nonempty ? [capability] : [],
        values: nonempty
          ? [
              { capability, item: 'position', value: 'after_action', from: 'factory' },
              { capability, item: 'dimension', value: { scope: 'each' }, from: 'factory' },
              { capability, item: 'power', value: { allowed: ['observe'] }, from: 'factory' },
              { capability, item: 'usableBy', value: { allowed: ['self'] }, from: 'factory' },
            ]
          : [],
        filteredOut: [],
        unresolved: [],
      },
      compositionOrder: nonempty ? [capability] : [],
      filledBy: { kind: 'assembly' },
    },
  }
  return { head: 1, latest: { loop_extension: record } }
}

export type SubmitScenario = {
  readonly decision?: 'allow' | 'no_such_entry' | 'unparseable'
  readonly storage?: 'configured' | 'declared'
  readonly nonempty?: boolean
  readonly executor?: ToolExecutor
}

export async function submitFixture(options: SubmitScenario = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'omne-tool-submit-'))
  const log = await openSqlLogFixture({ dir })
  const unused = vi.fn((): never => {
    throw new Error('unexpected controlled port')
  })
  const { admissionToken: _token, ...withoutToken } = request
  const submitted: ExecutionSubmission =
    options.decision === 'unparseable'
      ? {
          ...withoutToken,
          call: {
            id: request.call.id,
            kind: 'tool_call',
            complete: true,
            visibility: request.call.visibility,
            callId: ref.callId,
            tool: 'echo',
            unparseable: true,
            rawArguments: '{',
          },
        }
      : options.decision === 'no_such_entry'
        ? { ...withoutToken }
        : { ...request }
  const adoptedDefinition: ToolDefinition =
    options.storage === 'declared'
      ? { ...definition, needs: { attachmentStorage: 'declared-results' } }
      : definition
  const selected = {
    capability: 'tool:echo',
    asset: 'echo-asset',
    version: '1',
    definition: adoptedDefinition,
    adoption: 'adopted',
  }
  const trace: string[] = []
  const implementation = vi.fn<ToolExecutor>(options.executor ?? (async () => 'factory-result'))
  const implementations = createToolImplementationRegistry()
  const withdraw = implementations.register({ ...selected, executor: implementation })
  const acquire = vi.fn(implementations.acquire)
  const authorize = vi.fn<ToolRuntimeDependencies['authorization']['authorize']>(
    async (candidate, candidateScope, operation) =>
      candidate === access &&
      JSON.stringify(candidateScope) === JSON.stringify(scope) &&
      operation.startsWith('tool.')
        ? {
            kind: 'authorized',
            identity: {
              binding: 'controlled',
              principal: 'user',
              principalKind: 'human',
              scope,
              consumer: 'tool',
              contextKeys: [],
            },
          }
        : { kind: 'rejected', reason: 'notAuthorized' },
  )
  const history: ToolActionHistoryOperations = {
    inspect(prefix, callId) {
      const projected = projectToolJournal(prefix.scope, prefix.entries)
      if ('invalid' in projected) return { kind: 'unavailable' }
      const execution = projected.executions.get(callId)
      const facts: ToolActionFacts = {
        origin: submitted.origin,
        latestAttempt: 1,
        runState: 'open',
        calls: [submitted.call],
        route: execution
          ? { kind: 'execution', intentKey: execution.intent.entry.dedupeKey! }
          : { kind: 'none' },
        adoption: {
          key: 'adopted',
          tools: [
            {
              name: 'echo',
              capability: 'tool:echo',
              asset: 'echo-asset',
              version: '1',
              definition: adoptedDefinition,
            },
          ],
          report: {
            session: scope.session,
            runId: 'owner-run',
            attempt: 1,
            computedAt: 0 as ToolActionFacts['adoption']['report']['computedAt'],
            snapshots: [],
            availability: [],
            mcpActions: [],
            endpointHoldings: [],
            effectivePermissions: {},
            skillGate: [],
          },
        },
        batch: {
          kind: 'complete',
          completion: {
            key: 'batch',
            gate: { kind: 'available' },
            items: [
              {
                callId: ref.callId,
                effectiveCall: submitted.call,
                conclusions: ['official'],
                decision:
                  options.decision && options.decision !== 'allow'
                    ? { kind: 'notExecutable', reason: options.decision }
                    : { kind: 'allow', conclusion: 'official' },
              },
            ],
          },
        },
      }
      return { kind: 'known', facts }
    },
  }
  const recovery = Object.freeze({}) as RecoveryAccess
  const verifyToken = vi.fn<
    NonNullable<ReturnType<ToolRuntimeDependencies['admission']>>['verifyToken']
  >(async (candidate, candidateScope, token, call) => {
    if (
      candidate !== access ||
      JSON.stringify(candidateScope) !== JSON.stringify(scope) ||
      token !== request.admissionToken ||
      JSON.stringify(call) !== JSON.stringify(submitted.call)
    )
      return { kind: 'failed', reason: 'unavailable' }
    const view = await log.readSince(scope.session, 0)
    return 'failure' in view
      ? { kind: 'failed', reason: 'unavailable' }
      : { kind: 'valid', checked: { scope, ownerGeneration: 'owner-generation', tail: view.tail } }
  })
  const admission = { forPass: unused, verifyToken }
  const bindContext = vi.fn<ToolRuntimeDependencies['context']['bind']>(async () => ({
    kind: 'bound',
    reader: { read: unused, snapshot: unused, changes: unused },
  }))
  const writer: ToolResultWriter = {
    storeRaw: unused,
    putAttachment: vi.fn<ToolResultWriter['putAttachment']>(async () => ({
      kind: 'stored',
      reference: {
        storage: 'declared-results',
        key: 'attachment-one',
        mediaType: 'text/plain',
        bytes: 5,
        name: 'note.txt',
      },
    })),
    recordResult: vi.fn<ToolResultWriter['recordResult']>(async () => {
      trace.push('recordResult')
      return 'recorded'
    }),
  }
  const recordResult = vi.mocked(writer.recordResult),
    putAttachment = vi.mocked(writer.putAttachment)
  const available = vi.fn<ToolRuntimeDependencies['results']['available']>(async () => {
    trace.push('available')
    return { kind: 'available', storage: 'alternate-read-description', readerTool: 'reader' }
  })
  const bindWriter = vi.fn<ToolRuntimeDependencies['results']['bindWriter']>(async () => {
    trace.push('bindWriter')
    return { kind: 'bound', writer }
  })
  let heldActive = true
  const holdingTenant = vi.fn<RunnerReadScope['sources']['sessionTenancy']['holdingTenant']>(
    async () => ({ tenant: scope.tenant }),
  )
  const readHead = vi.fn<RunnerReadScope['sources']['manifest']['readHead']>(async () =>
    chainHead(options.nonempty),
  )
  const readVersion = vi.fn<RunnerReadScope['sources']['history']['read']>(async () => ({
    version: {
      number: 1,
      publishedAt: '2026-09-29T00:00:00Z',
      content: { category: 'loop_extension', extension },
    },
  }))
  const sources: RunnerReadScope['sources'] = {
    sessionTenancy: { holdingTenant },
    manifest: { readHead, dependencyPresence: unused },
    history: { read: readVersion },
    isActive: () => true,
  }
  const release = vi.fn(() => {
    heldActive = false
    trace.push('release')
  })
  const held: RunnerReadScope = {
    binding: { session: scope.session, tenant: scope.tenant, logGeneration: 'owner-generation' },
    sources,
    isActive: () => heldActive,
    release,
    owner: {
      start: unused,
      hasUnknown: unused,
      closeAdmission: unused,
      drain: unused,
      reconcileStoppedLog: unused,
    },
  }
  const acquireReplay = vi.fn<ToolRuntimeDependencies['runnerHost']['acquireReplay']>(
    async () => held,
  )
  const append = vi.fn<typeof log.append>(async (...args) => {
    trace.push('append')
    return log.append(...args)
  })
  const now = vi.fn(async () => unwrap(instantFromRfc3339(at)))
  const dependencies: ToolRuntimeDependencies = {
    recovery,
    backing: {
      ownerGeneration: 'owner-generation',
      borrow: () => ({ log: { ...log, append }, release: async () => {} }),
    },
    owner: {
      enumerate: async candidate =>
        candidate === recovery
          ? { kind: 'sessions', sessions: [] }
          : { kind: 'rejected', reason: 'notAuthorized' },
      readPrefix: unused,
      borrow: unused,
    },
    authorization: { authorize },
    history,
    admission: () => admission,
    implementations: { ...implementations, acquire },
    context: { bind: bindContext },
    environments: {
      recover: unused,
      recoverOwned: unused,
      resolvePlacement: unused,
      acquire: unused,
    },
    results: {
      available,
      bindWriter,
      readResult: unused,
      readBytes: unused,
      readForDelivery: unused,
      readDeliveryBytes: unused,
    },
    runnerHost: { acquireDispatch: unused, acquireReplay },
    clock: { now },
    invoke: createToolInvoker({
      parameters: createParameterJudge(),
      judgeResult: value =>
        isToolReturn(value)
          ? {
              kind: 'valid',
              result:
                typeof value === 'string'
                  ? value
                  : toolResultOf(value, unwrap(parseOpaqueIdentifier('judged-result', 'BlockId'))),
            }
          : { kind: 'invalid' },
    }),
  }
  const config = { ...factoryConfig() }
  const runtime = createToolRuntime(config, dependencies)
  const observers = new Set<ExecutionObserver>()
  const gates: (() => void)[] = []
  return {
    dir,
    log,
    submitted,
    selected,
    trace,
    config,
    dependencies,
    runtime,
    held,
    sources,
    implementation,
    withdraw,
    acquire,
    verifyToken,
    bindContext,
    writer,
    recordResult,
    putAttachment,
    available,
    bindWriter,
    acquireReplay,
    holdingTenant,
    readHead,
    readVersion,
    release,
    append,
    now,
    unused,
    revokeHeld() {
      heldActive = false
    },
    gate() {
      const gate = deferred<void>()
      gates.push(() => gate.resolve())
      return gate
    },
    async end() {
      await runtime.idle()
      const observer = await runtime.operations.acquire(access, ref)
      if (observer.kind !== 'acquired') throw new Error(`observer rejected ${observer.reason}`)
      observers.add(observer.observer)
      return observer.observer.waitForEnd()
    },
    async projected() {
      const view = await log.readSince(scope.session, 0)
      if ('failure' in view) throw new Error('original SQL unavailable')
      const projected = projectToolJournal(scope, view.entries)
      if ('invalid' in projected) throw new Error('invalid tool journal')
      return projected
    },
    async close() {
      for (const releaseGate of gates) releaseGate()
      for (const observer of observers) observer.release()
      withdraw()
      try {
        await runtime.close()
        const read = await log.readSince(scope.session, 0)
        if ('failure' in read) throw new Error('runtime closed shared SQL')
      } finally {
        try {
          await log.close()
        } finally {
          await rm(dir, { recursive: true, force: true })
        }
      }
    },
  }
}

export async function assertFinished(
  f: Awaited<ReturnType<typeof submitFixture>>,
  terminal: ExecutionTerminal,
  started: boolean,
  chain: JsonValue = [],
) {
  const success = terminal.outcome === 'completed'
  const text = success
    ? 'factory-result'
    : terminal.outcome === 'failed'
      ? terminal.code
      : terminal.outcome === 'unavailable'
        ? terminal.reason
        : terminal.outcome
  const id = (purpose: string) =>
    unwrap(
      parseOpaqueIdentifier(
        `tool-${createHash('sha256')
          .update(
            JSON.stringify([
              scope.tenant.organization,
              scope.tenant.account,
              scope.session,
              ref.callId,
              purpose,
            ]),
          )
          .digest('hex')}`,
        'BlockId',
      ),
    )
  const content = [
    {
      id: id(success ? 'original-text' : 'ending-text'),
      kind: 'text',
      visibility: { toHuman: true, toModel: true },
      text,
    },
  ]
  const account = {
    callId: ref.callId,
    initiator: scope.tenant,
    externalEffect: 'unknown',
    cost: { total_usd: 0, items: [] },
    frames: {
      emitted: 0,
      trims: {
        cut: 0,
        merged: 0,
        omittedBytes: 0,
        byReason: { frame_too_long: 0, quota_exhausted: 0, rate_merged: 0, rejected: 0 },
      },
    },
    wallClock: { startedAt: at, endedAt: at },
  }
  const selection = f.submitted.admissionToken === undefined ? {} : { selected: f.selected }
  expect(await f.end()).toEqual({
    kind: 'found',
    snapshot: {
      ref,
      origin: request.origin,
      ...selection,
      adoptedContext: [],
      resources: [],
      state: { phase: 'ended', terminal, account },
    },
  })
  const projected = await f.projected()
  expect(projected.executions.size).toBe(1)
  const execution = projected.executions.get(ref.callId)!
  expect(execution.intent.value).toEqual({
    kind: 'execution_intended',
    revision: 1,
    ref,
    origin: request.origin,
    ...selection,
    input: {
      format: 'tool-input/1',
      submission: { origin: request.origin, adoption: 'adopted', call: f.submitted.call },
      acceptedAt: at,
      chain,
      pass,
    },
  })
  expect(execution.started?.value).toEqual(
    started ? { kind: 'execution_started', revision: 1, ref, at } : undefined,
  )
  expect(execution.terminal?.value).toEqual({
    kind: 'execution_ended',
    revision: 1,
    ref,
    terminal,
    account,
    delivery: {
      result: {
        id: id('result'),
        kind: 'tool_result',
        callId: ref.callId,
        visibility: { toHuman: true, toModel: true },
        outcome: terminal.outcome,
        blocks: content,
      },
      pass,
      selectedChain: chain,
    },
  })
  if (success) {
    expect(f.recordResult.mock.calls).toEqual([[{ ref, result: { content } }]])
    expect(f.recordResult.mock.contexts).toEqual([f.writer])
  } else expect(f.recordResult).not.toHaveBeenCalled()
  expect(f.unused).not.toHaveBeenCalled()
}
export const otherTenant = unwrap(
  parseTenantId({ organization: 'other-org', account: 'owner-user' }),
)
