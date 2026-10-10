import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { vi } from 'vitest'
import { parseOpaqueIdentifier, parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import { instantFromRfc3339 } from '@omne-harness-lite/offer-expiry'
import type { SessionLog } from '@omne-harness-lite/session-log'
import { openSqlLogFixture } from './sql-log-fixture.ts'
import type { SessionAccess, SessionAccessOperations } from '@omne-harness-lite/session-tenancy'
import {
  createParameterJudge,
  isToolReturn,
  toolResultOf,
  type ToolDefinition,
} from '@omne-harness-lite/tool-definition'
import type {
  AdmissionToken,
  ToolActionFacts,
  ToolActionHistoryOperations,
  ToolAdmissionOperations,
} from '@omne-harness-lite/tool-admission'
import {
  projectToolJournal,
  environmentToolOf,
  type DeliveryBasis,
  type ExecutionRef,
  type ExecutionSubmission,
  type ExecutionTerminal,
  type ToolExecutor,
  type ToolOriginalIssueSupport,
} from '@omne-harness-lite/tool-execution-runtime'
import { createExecutionOwner } from '../src/execution-owner.ts'
import { createToolImplementationRegistry } from '../src/implementations.ts'
import { createToolInvoker } from '../src/invoker.ts'
import { createRuntimeJournal } from '../src/runtime-journal.ts'

export const at = '2026-10-05T04:00:00.000Z'
export const scope = {
  tenant: unwrap(parseTenantId({ organization: 'owner-org', account: 'owner-user' })),
  session: unwrap(parseOpaqueIdentifier('owner-session', 'SessionRef')),
}
export const ref: ExecutionRef = {
  ...scope,
  callId: unwrap(parseOpaqueIdentifier('owner-call', 'CallId')),
}
// Authorization and admission are controlled ports here. Actual issuer/official Cordis composition is a separate obligation.
export const access = Object.freeze({}) as SessionAccess
export const definition: ToolDefinition = {
  name: 'echo',
  description: 'Echo a value',
  paradigm: 'single',
  origin: { kind: 'authored' },
  input: {
    type: 'object',
    properties: { value: { type: 'string', description: 'Value to echo' } },
    required: ['value'],
    description: 'Echo input',
  },
  permissions: { execute: { default: 'auto' } },
}
export const request: ExecutionSubmission = {
  access,
  scope,
  adoption: 'adopted',
  admissionToken: 'locator' as AdmissionToken,
  origin: { run: 'owner-run', attempt: 1, assistantMessage: 'reply' },
  call: {
    id: unwrap(parseOpaqueIdentifier('call-block', 'BlockId')),
    kind: 'tool_call',
    complete: true,
    visibility: { toHuman: true, toModel: true },
    callId: ref.callId,
    tool: 'echo',
    arguments: { value: 'captured' },
  },
}
export function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}
export function frozenDelivery(
  terminal: ExecutionTerminal,
  chain: DeliveryBasis['selectedChain'],
  pass: string,
): DeliveryBasis {
  const returned =
    terminal.outcome === 'completed'
      ? terminal.result
      : terminal.outcome === 'failed' && terminal.result !== undefined
        ? terminal.result
        : terminal.outcome
  const normalized = toolResultOf(returned, unwrap(parseOpaqueIdentifier('result-text', 'BlockId')))
  return {
    result: {
      id: unwrap(parseOpaqueIdentifier('result-block', 'BlockId')),
      kind: 'tool_result',
      callId: ref.callId,
      visibility: { toHuman: true, toModel: true },
      blocks: normalized.content,
      outcome: terminal.outcome,
      ...(terminal.outcome === 'interrupted'
        ? { reason: { code: 'user_interrupted' as const, text: terminal.reason } }
        : {}),
    } as DeliveryBasis['result'],
    pass,
    selectedChain: chain,
  }
}
/** Real SQL journal/codec/projection/invoker/implementation registry. Delivery bytes and chain selection remain controlled inputs. */
export async function fixture(
  executor: ToolExecutor = async () => 'actual-result',
  invalidated?: AbortSignal,
  adoptedDefinition: ToolDefinition = definition,
  environments?: Parameters<typeof createExecutionOwner>[0]['environments'],
  originalIssue?: (
    log: Awaited<ReturnType<typeof openSqlLogFixture>>,
  ) => ToolOriginalIssueSupport | Promise<ToolOriginalIssueSupport>,
) {
  const dir = await mkdtemp(join(tmpdir(), 'omne-execution-owner-'))
  const log = await openSqlLogFixture({ dir: dir })
  const append = vi.fn<SessionLog['append']>(log.append),
    readSince = vi.fn(log.readSince)
  const implementation = vi.fn(executor),
    implementations = createToolImplementationRegistry()
  const withdraw = implementations.register({
    capability: 'tool:echo',
    asset: 'echo-asset',
    version: '1',
    definition: adoptedDefinition,
    executor: implementation,
    ...(invalidated ? { invalidated } : {}),
  })
  let authorized = true
  const authorize = vi.fn<SessionAccessOperations['authorize']>(async (_access, candidate) =>
    authorized && JSON.stringify(candidate) === JSON.stringify(scope)
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
      const facts: ToolActionFacts = {
        origin: request.origin,
        latestAttempt: prefix.entries.some(entry => entry.dedupeKey === 'attempt-changed') ? 2 : 1,
        runState: prefix.entries.some(entry => entry.dedupeKey === 'run-ended') ? 'ended' : 'open',
        calls: [request.call],
        route: projected.executions.has(callId)
          ? {
              kind: 'execution',
              intentKey: projected.executions.get(callId)!.intent.entry.dedupeKey!,
            }
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
                effectiveCall: request.call,
                conclusions: ['official'],
                decision: { kind: 'allow', conclusion: 'official' },
              },
            ],
          },
        },
      }
      return { kind: 'known', facts }
    },
  }
  const backing = {
    ownerGeneration: 'owner-generation',
    borrow: () => ({
      log: { append, readSince, readByKey: log.readByKey },
      release: async () => {},
    }),
  }
  const journal = createRuntimeJournal({ backing, history })
  const admission: ToolAdmissionOperations = {
    forPass: async () => ({ kind: 'rejected', reason: 'passUnavailable' }),
    verifyToken: async () => {
      const view = await log.readSince(scope.session, 0)
      if ('failure' in view) return { kind: 'failed', reason: 'unavailable' }
      return {
        kind: 'valid',
        checked: { scope, ownerGeneration: backing.ownerGeneration, tail: view.tail },
      }
    },
  }
  const bind = vi.fn<Parameters<typeof createExecutionOwner>[0]['context']['bind']>(async () => ({
    kind: 'bound' as const,
    reader: {
      read: async (keys: readonly string[]) => ({
        kind: 'values' as const,
        values: keys.map(key => ({ key, revision: '1', value: 'actual-context', observedAt: at })),
      }),
    },
  }))
  const prepareDelivery = vi.fn(
    async ({
      terminal,
      chain,
      pass,
    }: Parameters<Parameters<typeof createExecutionOwner>[0]['prepareDelivery']>[0]) => ({
      terminal,
      delivery: frozenDelivery(terminal, chain, pass),
    }),
  )
  const selectChain = vi.fn<Parameters<typeof createExecutionOwner>[0]['selectChain']>(
    async () => ({ chain: [], pass: 'after-action-pass' }),
  )
  const owner = createExecutionOwner({
    journal,
    ...(originalIssue ? { originalIssue: await originalIssue(log) } : {}),
    ...(environments ? { environments } : {}),
    authorization: { authorize },
    admission: () => admission,
    implementations,
    context: { bind },
    clock: { now: async () => unwrap(instantFromRfc3339(at)) },
    attempts: 3,
    invoke: createToolInvoker({
      parameters: createParameterJudge(),
      judgeResult: value => {
        return isToolReturn(value)
          ? {
              kind: 'valid',
              result:
                typeof value === 'string'
                  ? value
                  : toolResultOf(value, unwrap(parseOpaqueIdentifier('judged-result', 'BlockId'))),
            }
          : { kind: 'invalid' }
      },
    }),
    selectChain,
    prepareDelivery,
  })
  async function observer() {
    const acquired = await owner.operations.acquire(access, ref)
    if (acquired.kind !== 'acquired') throw new Error(`fixture acquire ${acquired.reason}`)
    return acquired.observer
  }
  return {
    dir,
    backing,
    history,
    admission,
    owner,
    journal,
    log,
    append,
    readSince,
    implementation,
    withdraw,
    authorize,
    bind,
    prepareDelivery,
    selectChain,
    observer,
    revoke() {
      authorized = false
    },
    async marker(key: string) {
      const view = await log.readSince(scope.session, 0)
      if ('failure' in view) throw new Error('fixture unavailable')
      const result = await log.append(
        scope.session,
        [
          {
            tenant: scope.tenant,
            dedupeKey: key,
            readKeys: [key],
            payload: { controlledRunMarker: key },
          },
        ],
        { kind: 'unfenced' },
        { kind: 'tailEquals', tail: view.tail },
      )
      if ('failure' in result) throw new Error(`fixture marker ${result.failure}`)
      return result
    },
    async close() {
      await owner.close()
      await log.close()
      await rm(dir, { recursive: true, force: true })
    },
  }
}
