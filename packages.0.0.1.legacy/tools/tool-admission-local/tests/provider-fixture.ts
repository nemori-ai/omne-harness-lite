import { vi } from 'vitest'
import { judgeContentBlock, type ToolCallBlock } from '@omne-harness-lite/content-blocks'
import {
  parseOpaqueIdentifier,
  parseTenantId,
  tenantIdEquals,
  unwrap,
} from '@omne-harness-lite/identity-values'
import {
  encodeRunnerAdmissionToken,
  prepareRunnerConclusion,
} from '@omne-harness-lite/loop-extension-runner'
import type {
  LogEntry,
  ReadResult,
  SessionLog,
  SessionLogBackingOperations,
} from '@omne-harness-lite/session-log'
import type { SessionAccess, SessionAccessOperations } from '@omne-harness-lite/session-tenancy'
import {
  OFFICIAL_ADMISSION_NAME,
  type AuthorizationContext,
  type ToolActionFacts,
  type ToolActionHistoryOperations,
  type ToolAdmissionPassSourceOperations,
} from '@omne-harness-lite/tool-admission'
import { createToolAdmission } from '../src/provider.ts'

export const scope = {
  tenant: unwrap(parseTenantId({ organization: 'provider-org', account: 'provider-user' })),
  session: unwrap(parseOpaqueIdentifier('provider-session', 'SessionRef')),
}
export function parsedCall(callId = 'call', args: unknown = { n: 1 }) {
  const judged = judgeContentBlock({
    kind: 'tool_call',
    id: `block-${callId}`,
    callId,
    tool: 'echo',
    arguments: args,
    complete: true,
    visibility: { toHuman: true, toModel: true },
  })
  if (
    !('ok' in judged) ||
    judged.ok.kind !== 'tool_call' ||
    judged.ok.complete !== true ||
    judged.ok.unparseable === true
  )
    throw new Error('invalid call fixture')
  return judged.ok
}
export function fixture() {
  const call = parsedCall(),
    access = Object.freeze({}) as SessionAccess
  const prepared = prepareRunnerConclusion({
    ...scope,
    execution: { kind: 'withRun', run: 'run', attempt: 1 },
    anchor: 'action-call',
    occurrence: { kind: 'final' },
    reminders: [],
    value: {
      position: 'before_action',
      callId: call.callId,
      extension: OFFICIAL_ADMISSION_NAME,
      power: 'veto',
      at: '2026-10-04T00:00:00Z',
      output: { kind: 'observed' },
    },
  })
  if ('invalidInput' in prepared || prepared.entry.dedupeKey === undefined)
    throw new Error('invalid conclusion fixture')
  const finalKey = prepared.entry.dedupeKey,
    token = encodeRunnerAdmissionToken(call, finalKey)
  if (typeof token !== 'string') throw new Error('invalid token fixture')
  // This unit fixture controls the history port. Application tests use the actual common projection and JSONL owner.
  const initialFacts: ToolActionFacts = {
    origin: { run: 'run', attempt: 1, assistantMessage: 'reply' },
    latestAttempt: 1,
    runState: 'open',
    adoption: {
      key: 'adoption',
      report: {} as ToolActionFacts['adoption']['report'],
      tools: [{ name: 'echo' } as ToolActionFacts['adoption']['tools'][number]],
    },
    calls: [call],
    route: { kind: 'none' },
    batch: {
      kind: 'complete',
      completion: {
        key: 'complete',
        gate: { kind: 'available' },
        items: [
          {
            callId: call.callId,
            effectiveCall: call,
            anchor: 'action-call',
            conclusions: [finalKey],
            decision: { kind: 'allow', conclusion: finalKey },
          },
        ],
      },
    },
  }
  let facts = initialFacts,
    authorized = true,
    generation = 'owner-one',
    response: ReturnType<ToolActionHistoryOperations['inspect']> | undefined
  let rows: readonly LogEntry[] = [
    {
      ...prepared.entry,
      payload: prepared.entry.payload as LogEntry['payload'],
      session: scope.session,
      position: 1,
    },
    {
      tenant: scope.tenant,
      session: scope.session,
      position: 2,
      dedupeKey: 'complete',
      readKeys: [],
      payload: {},
    },
  ]
  const read = vi.fn<SessionLog['readSince']>(async () => ({ entries: rows, tail: rows.length }))
  const release = vi.fn(async () => {}),
    borrow = vi.fn(() => ({
      log: { readSince: read, append: vi.fn(), readByKey: vi.fn() },
      release,
    }))
  const backing: SessionLogBackingOperations = {
    get ownerGeneration() {
      return generation
    },
    borrow,
  }
  const authority: SessionAccessOperations = {
    authorize: vi.fn(async (candidate, target, operation) => {
      return authorized &&
        candidate === access &&
        target.session === scope.session &&
        tenantIdEquals(target.tenant, scope.tenant) &&
        ['tool.submit', 'run.advance'].includes(operation)
        ? {
            kind: 'authorized' as const,
            identity: {
              scope: target,
              binding: 'binding',
              principal: 'user',
              principalKind: 'human' as const,
              consumer: 'coordinator' as const,
              contextKeys: [],
            },
          }
        : { kind: 'rejected' as const, reason: 'notAuthorized' as const }
    }),
  }
  const history: ToolActionHistoryOperations = {
    inspect: vi.fn<ToolActionHistoryOperations['inspect']>(
      () => response ?? { kind: 'known', facts },
    ),
  }
  const grants = Object.freeze({}) as AuthorizationContext
  const input = {
    call,
    definition: { name: 'echo' },
    grants,
    runMode: 'bypass-permissions' as const,
    effectivePermission: { value: 'auto' as const, from: 'tenant' as const },
    tenantAutoWritable: true,
  }
  const source: ToolAdmissionPassSourceOperations = {
    read: vi.fn<ToolAdmissionPassSourceOperations['read']>(async () => ({
      kind: 'found',
      record: { inputs: [input], finalKeys: [finalKey], isActive: () => true },
    })),
  }
  const provider = createToolAdmission({ access: authority, source, history, backing })
  return {
    access,
    call,
    token,
    finalKey,
    provider,
    read,
    release,
    borrow,
    backing,
    authority,
    history,
    source,
    input,
    rows: () => rows,
    facts: () => facts,
    setRows(value: readonly LogEntry[]) {
      rows = value
    },
    setFacts(value: ToolActionFacts) {
      facts = value
    },
    setHistory(value: typeof response) {
      response = value
    },
    revoke() {
      authorized = false
    },
    changeGeneration() {
      generation = 'owner-two'
    },
    verify(candidate: ToolCallBlock = call) {
      return provider.verifyToken(access, scope, token, candidate)
    },
    blockRead() {
      const pending = Promise.withResolvers<ReadResult>()
      read.mockImplementationOnce(() => pending.promise)
      return pending
    },
  }
}
