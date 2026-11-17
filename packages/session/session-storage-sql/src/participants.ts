export {
  SESSION_RUN_LIVE_FACT,
  SESSION_RUN_LIVE_GUARD,
  RunLiveSchema,
  runLiveGuardFacts,
  type RunLive,
} from './run-live.ts'
export {
  SESSION_PERMISSION_CURRENT_HANDLER,
  SESSION_PERMISSION_MODE_HANDLER,
  SESSION_PERMISSION_CURRENT_FACT,
  SESSION_PERMISSION_GUARD,
  sessionPermissionGuardFacts,
  decodeSessionPermissionCurrent,
  decodeSessionPermissionMode,
  type SessionPermissionRead,
  type SessionPermissionCurrent,
  type SessionPermissionReadResult,
  type SessionPermissionMode,
  type SessionPermissionModeResult,
} from './permission-current.ts'
import { SESSION_ORDINARY_BASIS, SESSION_COMMIT_PROTOCOL } from './commit-basis.ts'
import { sessionIntakeLimits, type SessionIntakeLimits } from '@omne-harness/session-contract'
import type {
  DurableEvidence,
  GuardCommand,
  RoutedInput,
  SessionCommand,
  SessionId,
  WorkSnapshot,
} from '@omne-harness/session-contract'
import type { FactCommandV2, JsonValue, RecordedReply } from '@omne-harness/sql-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import { canonicalText, decodeValue, encodeValue, sha256 } from './codec.ts'
import { readCachedSessionWork } from './work-cache.ts'

import { recordOf, SESSION_PARTICIPANT } from './session-reply.ts'

export { SESSION_PARTICIPANT }
export const EXECUTION_RECORD_PARTICIPANT = 'execution-record'
// execution-record runs before session: ascending names keep that order, so the joint checks of session see the same commit.
export const SESSION_LOG_PARTICIPANTS: readonly [
  typeof EXECUTION_RECORD_PARTICIPANT,
  typeof SESSION_ORDINARY_BASIS,
  typeof SESSION_PARTICIPANT,
] = [EXECUTION_RECORD_PARTICIPANT, SESSION_ORDINARY_BASIS, SESSION_PARTICIPANT]

export const SESSION_PROTOCOL = SESSION_COMMIT_PROTOCOL
export const SESSION_READ_PROTOCOL = '1'
export const EXECUTION_RECORD_PROTOCOL = '1'

export const SESSION_HISTORY_ROOT_HANDLER = 'session.history-root'
export const SESSION_WORK_HANDLER = 'session.work'
export const SESSION_INPUT_HANDLER = 'session.input'
export const SESSION_EXECUTION_HANDLER = 'session.execution'
export const SESSION_ENTRY_MESSAGE_HANDLER = 'session.entry-message'
export const SESSION_COMPACTION_INPUT_CHECK_HANDLER = 'session.compaction-input-check'
export const EXECUTION_RECORD_HANDLERS = {
  facts: 'execution-record.facts',
  openExecutions: 'execution-record.open-executions',
  events: 'execution-record.events',
  operation: 'execution-record.operation',
  blob: 'execution-record.blob',
  blobs: 'execution-record.blobs',
  openItems: 'execution-record.open-items',
  items: 'execution-record.items',
  preadmission: 'execution-record.preadmission',
} as const

export function sessionCommandFacts(
  command: SessionCommand,
  guards: readonly GuardCommand[],
  intakeLimits?: SessionIntakeLimits,
  at: string | null = null,
): FactCommandV2 {
  return {
    participant: SESSION_PARTICIPANT,
    facts: {
      intent: 'command',
      command: encodeValue(command),
      guards: encodeValue(guards),
      intakeLimits: encodeValue(sessionIntakeLimits(intakeLimits)),
      ...(at === null ? {} : { at }),
    },
  }
}

// In the open and submit checks, origin is the source basis of the Agent's AcceptedInput, not the origin Session recorded.
export type SessionAdmittedInput = Pick<
  Extract<RoutedInput, { kind: 'ordinary' }>,
  'input' | 'origin' | 'message'
>

type CheckScope = Readonly<{ tenant: TenantId; session: SessionId; execution: string }>

export type SessionCheck =
  | (CheckScope & Readonly<{ kind: 'open'; grant: DurableEvidence; initial: SessionAdmittedInput }>)
  | (CheckScope & Readonly<{ kind: 'submit'; value: SessionAdmittedInput }>)
  | (CheckScope & Readonly<{ kind: 'attach'; grant: DurableEvidence }>)
  | (CheckScope &
      Readonly<{
        kind: 'finish'
        conclusion: 'complete' | 'failed' | 'cancelled'
        control: string | null
      }>)

export type SessionCheckResult = Readonly<{
  kind: 'checked'
  attempt: string | null
  advance: 'ordinary' | 'wind-down' | null
}>

export function sessionCheckFacts(check: SessionCheck): FactCommandV2 {
  return {
    participant: SESSION_PARTICIPANT,
    facts: { intent: 'check', check: encodeValue(check) },
  }
}

export function sessionCheckDigest(check: SessionCheck): string {
  return `sha256:${sha256(canonicalText(encodeValue(check)))}`
}

export {
  decodeSessionReply,
  type SessionCommittedBatch,
  type SessionParticipation,
  type SessionWorkReply,
} from './session-reply.ts'

export { blobDigest, EXECUTION_BATCH_MAX_FACTS, EXECUTION_FACT_MAX_BYTES } from './codec.ts'

export type ExecutionBoundaryRecord = Readonly<{
  execution: string
  revision: string
  receipt: DurableEvidence
  emittedThrough: string
  ended: Readonly<{ sequence: string; source: DurableEvidence }> | null
}>

export type ExecutionEventProjection = Readonly<{
  sequence: string
  source: DurableEvidence
  kinds: readonly string[]
  consequences?: JsonValue
  control?: JsonValue
  batch?: JsonValue
}>

export type ExecutionFactRecord = Readonly<{
  execution?: string
  kind: string
  event?: ExecutionEventProjection
  body: JsonValue
}>

export type ExecutionBlobRecord = Readonly<{ digest: string; media: string; payload: string }>

// One item of an execution view a publication opens or changes; `open` is its state after it.
export type ExecutionItemRecord = Readonly<{
  execution?: string
  family: string
  item: string
  change: 'opened' | 'changed'
  open: boolean
  body: JsonValue
}>

export type ExecutionAdmissionRecord = Readonly<{
  input: string
  execution: string
  operation: string
  accepted: DurableEvidence
  grant: DurableEvidence
  attachment: string
  attempt?: string
}>

export type ExecutionRecordWrite = Readonly<{
  tenant: TenantId
  session: SessionId
  execution: string
  expected: string | null
  revision: string
  published: string
  operation: string
  digest: string
  facts: readonly ExecutionFactRecord[]
  blobs: readonly ExecutionBlobRecord[]
  items: readonly ExecutionItemRecord[]
  boundaries: readonly ExecutionBoundaryRecord[]
  admissions: readonly ExecutionAdmissionRecord[]
}>

export function executionRecordFacts(write: ExecutionRecordWrite): FactCommandV2 {
  const { facts, blobs, items, ...rest } = write
  const encoded = encodeValue(rest) as Readonly<Record<string, JsonValue>>
  return {
    participant: EXECUTION_RECORD_PARTICIPANT,
    facts: {
      intent: 'publish',
      write: {
        ...encoded,
        facts: facts.map(({ execution, kind, event, body }) => ({
          ...(execution === undefined ? {} : { execution }),
          kind,
          body,
          ...(event === undefined
            ? {}
            : {
                event: {
                  ...(encodeValue({
                    sequence: event.sequence,
                    source: event.source,
                    kinds: event.kinds,
                  }) as Readonly<Record<string, JsonValue>>),
                  ...(event.consequences === undefined ? {} : { consequences: event.consequences }),
                  ...(event.control === undefined ? {} : { control: event.control }),
                  ...(event.batch === undefined ? {} : { batch: event.batch }),
                },
              }),
        })),
        blobs: blobs.map(({ digest, media, payload }) => ({ digest, media, payload })),
        items: items.map(({ execution, family, item, change, open, body }) => ({
          ...(execution === undefined ? {} : { execution }),
          family,
          item,
          change,
          open,
          body,
        })),
      },
    },
  }
}

export type ExecutionBlobsWrite = Readonly<{
  tenant: TenantId
  blobs: readonly ExecutionBlobRecord[]
}>

export function executionRecordBlobFacts(write: ExecutionBlobsWrite): FactCommandV2 {
  return {
    participant: EXECUTION_RECORD_PARTICIPANT,
    facts: {
      intent: 'blobs',
      write: {
        tenant: encodeValue(write.tenant),
        blobs: write.blobs.map(({ digest, media, payload }) => ({ digest, media, payload })),
      },
    },
  }
}

export type ExecutionRecordParticipation =
  | Readonly<{ kind: 'published'; published: string; digest: string }>
  | Readonly<{ kind: 'revision-conflict'; revision: string | null; published: string }>
  | Readonly<{ kind: 'operation-conflict'; digest: string; published: string }>
  | Readonly<{
      kind: 'item-conflict'
      execution: string
      family: string
      item: string
      held: 'none' | 'open' | 'closed'
    }>
  | Readonly<{ kind: 'failed'; diagnostic: string }>
  | Readonly<{ kind: 'unsupported'; reason: string }>

function otherReply(
  reply: Extract<RecordedReply, { kind: 'unsupported' | 'failed' }>,
):
  | Readonly<{ kind: 'failed'; diagnostic: string }>
  | Readonly<{ kind: 'unsupported'; reason: string }> {
  if (reply.kind === 'failed')
    return { kind: 'failed', diagnostic: `${reply.category}: ${reply.diagnostic}` }
  const reason = recordOf(reply.basis)?.['reason']
  return { kind: 'unsupported', reason: typeof reason === 'string' ? reason : 'unsupported' }
}

export function decodeExecutionRecordReply(reply: RecordedReply): ExecutionRecordParticipation {
  switch (reply.kind) {
    case 'participated': {
      const response = recordOf(reply.response)
      const published = response?.['published']
      const digest = response?.['digest']
      return typeof published === 'string' && typeof digest === 'string'
        ? { kind: 'published', published, digest }
        : { kind: 'failed', diagnostic: 'an execution-record reply without a count' }
    }
    case 'conflict': {
      const basis = recordOf(reply.basis)
      if (basis?.['kind'] === 'item') {
        const { execution, family, item, held } = basis
        return typeof execution === 'string' &&
          typeof family === 'string' &&
          typeof item === 'string' &&
          (held === 'none' || held === 'open' || held === 'closed')
          ? { kind: 'item-conflict', execution, family, item, held }
          : { kind: 'failed', diagnostic: 'an execution-record item conflict without a basis' }
      }
      const published = basis?.['published']
      const revision = basis?.['revision']
      if (typeof published !== 'string')
        return { kind: 'failed', diagnostic: 'an execution-record conflict without a basis' }
      if (basis?.['kind'] === 'revision' && (typeof revision === 'string' || revision === null))
        return { kind: 'revision-conflict', revision, published }
      const digest = basis?.['digest']
      if (basis?.['kind'] === 'operation' && typeof digest === 'string')
        return { kind: 'operation-conflict', digest, published }
      return { kind: 'failed', diagnostic: 'an execution-record conflict without a basis' }
    }
    case 'unsupported':
    case 'failed':
      return otherReply(reply)
  }
}

export type ExecutionBlobsParticipation =
  | Readonly<{ kind: 'stored'; digests: readonly string[] }>
  | Readonly<{ kind: 'failed'; diagnostic: string }>
  | Readonly<{ kind: 'unsupported'; reason: string }>

export function decodeExecutionBlobsReply(reply: RecordedReply): ExecutionBlobsParticipation {
  switch (reply.kind) {
    case 'participated': {
      const stored = recordOf(reply.response)?.['stored']
      return Array.isArray(stored) && stored.every(item => typeof item === 'string')
        ? { kind: 'stored', digests: stored as string[] }
        : { kind: 'failed', diagnostic: 'a blocks reply without its digests' }
    }
    case 'conflict':
      return { kind: 'failed', diagnostic: 'a blocks write does not conflict' }
    case 'unsupported':
    case 'failed':
      return otherReply(reply)
  }
}

export type ExecutionFact = Readonly<{
  ord: number
  execution: string
  kind: string
  sequence: string | null
  kinds: readonly string[]
  event: JsonValue
  body: JsonValue
}>

export type ExecutionBatch = Readonly<{
  published: string
  operation: string | null
  facts: readonly ExecutionFact[]
}>

export type ExecutionRecordDenied = Readonly<{ kind: 'denied' }>
export type ExecutionRecordMissing = Readonly<{ kind: 'missing'; published: string }>

export type ExecutionRecordFactsRead = Readonly<{
  tenant: string
  session: string
  after: string
  execution?: string | null
}>
export type ExecutionRecordFactsPage =
  | Readonly<{
      kind: 'facts'
      published: string
      batches: readonly ExecutionBatch[]
      next: string | null
    }>
  | ExecutionRecordMissing
  | ExecutionRecordDenied

const isTextOrNull = (value: JsonValue | undefined): value is string | null =>
  value === null || typeof value === 'string'

function factOf(value: JsonValue): ExecutionFact | null {
  const fact = recordOf(value)
  if (fact === null) return null
  const { ord, execution, kind, sequence, kinds } = fact
  return typeof ord === 'number' &&
    typeof execution === 'string' &&
    typeof kind === 'string' &&
    isTextOrNull(sequence) &&
    Array.isArray(kinds) &&
    kinds.every(item => typeof item === 'string') &&
    'body' in fact
    ? {
        ord,
        execution,
        kind,
        sequence,
        kinds: kinds as string[],
        event: fact['event'] ?? null,
        body: fact['body'] ?? null,
      }
    : null
}

function listDecoded<T>(
  value: JsonValue | undefined,
  decode: (item: JsonValue) => T | null,
): T[] | null {
  if (!Array.isArray(value)) return null
  const out: T[] = []
  for (const item of value as readonly JsonValue[]) {
    const decoded = decode(item)
    if (decoded === null) return null
    out.push(decoded)
  }
  return out
}

function batchOf(value: JsonValue): ExecutionBatch | null {
  const batch = recordOf(value)
  const facts = listDecoded(batch?.['facts'], factOf)
  return batch !== null &&
    typeof batch['published'] === 'string' &&
    isTextOrNull(batch['operation'] ?? null) &&
    facts !== null
    ? {
        published: batch['published'],
        operation: (batch['operation'] ?? null) as string | null,
        facts,
      }
    : null
}

function refusalOf(
  value: Readonly<{ readonly [key: string]: JsonValue }>,
): ExecutionRecordDenied | ExecutionRecordMissing | null {
  if (value['kind'] === 'denied') return { kind: 'denied' }
  const published = value['published']
  return value['kind'] === 'missing' && typeof published === 'string'
    ? { kind: 'missing', published }
    : null
}

export function decodeExecutionRecordFacts(output: JsonValue): ExecutionRecordFactsPage | null {
  const value = recordOf(output)
  if (value === null) return null
  if (value['kind'] !== 'facts') return refusalOf(value)
  const batches = listDecoded(value['batches'], batchOf)
  const { published, next } = value
  return typeof published === 'string' && isTextOrNull(next ?? null) && batches !== null
    ? { kind: 'facts', published, batches, next: (next ?? null) as string | null }
    : null
}

export type ExecutionRecordOpenRead = Readonly<{
  tenant: string
  session: string
  after?: string | null
}>
export type ExecutionOpenHead = Readonly<{
  execution: string
  revision: string
  receipt: JsonValue
  emittedThrough: string
}>
export type ExecutionRecordOpenPage =
  | Readonly<{
      kind: 'open'
      published: string
      executions: readonly ExecutionOpenHead[]
      next: string | null
    }>
  | ExecutionRecordMissing
  | ExecutionRecordDenied

function openHeadOf(value: JsonValue): ExecutionOpenHead | null {
  const head = recordOf(value)
  return head !== null &&
    typeof head['execution'] === 'string' &&
    typeof head['revision'] === 'string' &&
    typeof head['emittedThrough'] === 'string'
    ? {
        execution: head['execution'],
        revision: head['revision'],
        receipt: head['receipt'] ?? null,
        emittedThrough: head['emittedThrough'],
      }
    : null
}

export function decodeExecutionRecordOpen(output: JsonValue): ExecutionRecordOpenPage | null {
  const value = recordOf(output)
  if (value === null) return null
  if (value['kind'] !== 'open') return refusalOf(value)
  const executions = listDecoded(value['executions'], openHeadOf)
  const { published, next } = value
  return typeof published === 'string' && isTextOrNull(next ?? null) && executions !== null
    ? { kind: 'open', published, executions, next: (next ?? null) as string | null }
    : null
}

export type ExecutionRecordEventsRead = Readonly<{
  tenant: string
  session: string
  execution: string
  after: string
}>
export type ExecutionEvent = Readonly<{
  sequence: string
  published: string
  ord: number
  kind: string
  kinds: readonly string[]
  source: JsonValue
  consequences: JsonValue
  control: JsonValue
  batch: JsonValue
  body: JsonValue
}>
export type ExecutionRecordEventsPage =
  | Readonly<{
      kind: 'events'
      revision: string
      receipt: JsonValue
      emittedThrough: string
      ended: JsonValue
      events: readonly ExecutionEvent[]
      next: string | null
    }>
  | ExecutionRecordMissing
  | ExecutionRecordDenied

function eventOf(value: JsonValue): ExecutionEvent | null {
  const event = recordOf(value)
  if (event === null) return null
  const { sequence, published, ord, kind, kinds } = event
  return typeof sequence === 'string' &&
    typeof published === 'string' &&
    typeof ord === 'number' &&
    typeof kind === 'string' &&
    Array.isArray(kinds) &&
    kinds.every(item => typeof item === 'string')
    ? {
        sequence,
        published,
        ord,
        kind,
        kinds: kinds as string[],
        source: event['source'] ?? null,
        consequences: event['consequences'] ?? null,
        control: event['control'] ?? null,
        batch: event['batch'] ?? null,
        body: event['body'] ?? null,
      }
    : null
}

export function decodeExecutionRecordEvents(output: JsonValue): ExecutionRecordEventsPage | null {
  const value = recordOf(output)
  if (value === null) return null
  if (value['kind'] !== 'events') return refusalOf(value)
  const events = listDecoded(value['events'], eventOf)
  const { revision, emittedThrough, next } = value
  return typeof revision === 'string' &&
    typeof emittedThrough === 'string' &&
    isTextOrNull(next ?? null) &&
    events !== null
    ? {
        kind: 'events',
        revision,
        receipt: value['receipt'] ?? null,
        emittedThrough,
        ended: value['ended'] ?? null,
        events,
        next: (next ?? null) as string | null,
      }
    : null
}

export type ExecutionItemKey = Readonly<{ family: string; item: string }>
export type ExecutionItem = Readonly<{
  family: string
  item: string
  open: boolean
  pub: string
  body: JsonValue
}>

function itemKeyOf(value: JsonValue): ExecutionItemKey | null {
  const key = recordOf(value)
  return key !== null && typeof key['family'] === 'string' && typeof key['item'] === 'string'
    ? { family: key['family'], item: key['item'] }
    : null
}

function itemOf(value: JsonValue): ExecutionItem | null {
  const item = recordOf(value)
  const key = itemKeyOf(value)
  return item !== null &&
    key !== null &&
    typeof item['open'] === 'boolean' &&
    typeof item['pub'] === 'string' &&
    'body' in item
    ? { ...key, open: item['open'], pub: item['pub'], body: item['body'] ?? null }
    : null
}

export type ExecutionRecordOpenItemsRead = Readonly<{
  tenant: string
  session: string
  execution: string
  after: ExecutionItemKey | null
}>
export type ExecutionRecordOpenItemsPage =
  | Readonly<{
      kind: 'open'
      published: string
      items: readonly ExecutionItem[]
      next: ExecutionItemKey | null
    }>
  | ExecutionRecordMissing
  | ExecutionRecordDenied

export function decodeExecutionRecordOpenItems(
  output: JsonValue,
): ExecutionRecordOpenItemsPage | null {
  const value = recordOf(output)
  if (value === null) return null
  if (value['kind'] !== 'open') return refusalOf(value)
  const items = listDecoded(value['items'], itemOf)
  const next = value['next'] === null ? null : itemKeyOf(value['next'] ?? null)
  const { published } = value
  return typeof published === 'string' &&
    items !== null &&
    (value['next'] === null || next !== null)
    ? { kind: 'open', published, items, next }
    : null
}

export type ExecutionRecordItemsRead = Readonly<{
  tenant: string
  session: string
  execution: string
  keys: readonly ExecutionItemKey[]
}>
export type ExecutionRecordItems =
  | Readonly<{ kind: 'items'; published: string; items: readonly ExecutionItem[] }>
  | ExecutionRecordMissing
  | ExecutionRecordDenied

export function decodeExecutionRecordItems(output: JsonValue): ExecutionRecordItems | null {
  const value = recordOf(output)
  if (value === null) return null
  if (value['kind'] !== 'items') return refusalOf(value)
  const items = listDecoded(value['items'], itemOf)
  const { published } = value
  return typeof published === 'string' && items !== null
    ? { kind: 'items', published, items }
    : null
}

export type ExecutionRecordBlobsRead = Readonly<{ tenant: string; digests: readonly string[] }>
export type ExecutionRecordBlobs = Readonly<{
  kind: 'blobs'
  blobs: readonly Readonly<{ digest: string; media: string; size: string; payload: string }>[]
  missing: readonly string[]
  rest: readonly string[]
}>

const textList = (value: JsonValue | undefined): string[] | null =>
  Array.isArray(value) && value.every(item => typeof item === 'string') ? (value as string[]) : null

export function decodeExecutionRecordBlobs(output: JsonValue): ExecutionRecordBlobs | null {
  const value = recordOf(output)
  if (value?.['kind'] !== 'blobs') return null
  const blobs = listDecoded(value['blobs'], raw => {
    const { digest, media, size, payload } = recordOf(raw) ?? {}
    return typeof digest === 'string' &&
      typeof media === 'string' &&
      typeof size === 'string' &&
      typeof payload === 'string'
      ? { digest, media, size, payload }
      : null
  })
  const missing = textList(value['missing'])
  const rest = textList(value['rest'])
  return blobs !== null && missing !== null && rest !== null
    ? { kind: 'blobs', blobs, missing, rest }
    : null
}

export type ExecutionRecordBlobRead = Readonly<{ tenant: string; digest: string }>
export type ExecutionRecordBlob =
  | Readonly<{ kind: 'blob'; digest: string; media: string; size: string; payload: string }>
  | ExecutionRecordDenied

export function decodeExecutionRecordBlob(output: JsonValue): ExecutionRecordBlob | null {
  const value = recordOf(output)
  if (value?.['kind'] === 'denied') return { kind: 'denied' }
  const { digest, media, size, payload } = value ?? {}
  return value?.['kind'] === 'blob' &&
    typeof digest === 'string' &&
    typeof media === 'string' &&
    typeof size === 'string' &&
    typeof payload === 'string'
    ? { kind: 'blob', digest, media, size, payload }
    : null
}

export type ExecutionRecordOperationRead = Readonly<{ tenant: string; operation: string }>
export type ExecutionRecordOperation = Readonly<{
  digest: string
  session: string
  execution: string
  published: string
  facts: readonly ExecutionFact[]
}>

export function decodeExecutionRecordOperation(
  output: JsonValue,
): ExecutionRecordOperation | null | 'malformed' {
  if (output === null) return null
  const value = recordOf(output)
  const facts = listDecoded(value?.['facts'], factOf)
  const { digest, session, execution, published } = value ?? {}
  return typeof digest === 'string' &&
    typeof session === 'string' &&
    typeof execution === 'string' &&
    typeof published === 'string' &&
    facts !== null
    ? { digest, session, execution, published, facts }
    : 'malformed'
}

export type PreadmissionIntent = Readonly<{
  request: JsonValue
  origin: JsonValue
  principal: JsonValue
  qualification: JsonValue
  adoption: JsonValue
  materials: JsonValue
}>

export type PreadmissionIntentWrite = Readonly<{
  phase: 'intent'
  tenant: TenantId
  handoff: string
  entry: string | null
  session: SessionId | null
  execution: string | null
  intent: PreadmissionIntent
}>

export type PreadmissionOutcome = Readonly<{ kind: 'prepared' | 'rejected' }> &
  Readonly<{ [key: string]: JsonValue }>

export type PreadmissionOutcomeWrite = Readonly<{
  phase: 'outcome'
  tenant: TenantId
  handoff: string
  outcome: PreadmissionOutcome
}>

export function preadmissionFacts(
  write: PreadmissionIntentWrite | PreadmissionOutcomeWrite,
): FactCommandV2 {
  const { phase, tenant, ...rest } = write
  return {
    participant: EXECUTION_RECORD_PARTICIPANT,
    facts: {
      intent: 'preadmission',
      phase,
      write: { ...(rest as Readonly<Record<string, JsonValue>>), tenant: encodeValue(tenant) },
    },
  }
}

export type PreadmissionRecord = Readonly<{
  tenant: string
  handoff: string
  entry: string | null
  session: string | null
  execution: string | null
  intent: JsonValue
  intentDigest: string
  outcome: JsonValue | null
  outcomeDigest: string | null
}>

const textOrNull = (value: JsonValue | undefined): value is string | null =>
  value === null || typeof value === 'string'

export function decodePreadmissionRecord(
  output: JsonValue,
): PreadmissionRecord | null | 'malformed' {
  if (output === null) return null
  const value = recordOf(output)
  if (value === null) return 'malformed'
  const { tenant, handoff, entry, session, execution, intentDigest, outcomeDigest } = value
  return typeof tenant === 'string' &&
    typeof handoff === 'string' &&
    typeof intentDigest === 'string' &&
    textOrNull(entry) &&
    textOrNull(session) &&
    textOrNull(execution) &&
    textOrNull(outcomeDigest) &&
    value['intent'] !== undefined
    ? {
        tenant,
        handoff,
        entry,
        session,
        execution,
        intent: value['intent'],
        intentDigest,
        outcome: value['outcome'] ?? null,
        outcomeDigest,
      }
    : 'malformed'
}

export type PreadmissionParticipation =
  | Readonly<{ kind: 'saved'; created: boolean; record: PreadmissionRecord }>
  | Readonly<{ kind: 'conflict'; record: PreadmissionRecord }>
  | Readonly<{ kind: 'invalid'; reason: string }>
  | Readonly<{ kind: 'failed'; diagnostic: string }>
  | Readonly<{ kind: 'unsupported'; reason: string }>

function decodeSaved(response: JsonValue | undefined): PreadmissionParticipation {
  const value = recordOf(response)
  const created = value?.['created']
  const record = decodePreadmissionRecord(value?.['record'] ?? null)
  return value?.['kind'] === 'saved' &&
    typeof created === 'boolean' &&
    record !== null &&
    record !== 'malformed'
    ? { kind: 'saved', created, record }
    : { kind: 'failed', diagnostic: 'a preadmission reply without its record' }
}

function decodeRefusal(basis: JsonValue | undefined): PreadmissionParticipation {
  const value = recordOf(basis)
  const reason = value?.['reason']
  if (value?.['kind'] === 'invalid' && typeof reason === 'string')
    return { kind: 'invalid', reason }
  const record = decodePreadmissionRecord(value?.['record'] ?? null)
  return value?.['kind'] === 'preadmission' && record !== null && record !== 'malformed'
    ? { kind: 'conflict', record }
    : { kind: 'failed', diagnostic: 'a preadmission conflict without a basis' }
}

export function decodePreadmissionReply(reply: RecordedReply): PreadmissionParticipation {
  switch (reply.kind) {
    case 'participated':
      return decodeSaved(reply.response)
    case 'conflict':
      return decodeRefusal(reply.basis)
    case 'unsupported': {
      const reason = recordOf(reply.basis)?.['reason']
      return { kind: 'unsupported', reason: typeof reason === 'string' ? reason : 'unsupported' }
    }
    case 'failed':
      return { kind: 'failed', diagnostic: `${reply.category}: ${reply.diagnostic}` }
  }
}

export type PreadmissionRead =
  | Readonly<{ tenant: string; handoff: string }>
  | Readonly<{ tenant: string; entry: string }>

export type SessionExecutionRead = Readonly<{ tenant: string; execution: string }>
export type SessionExecution = Readonly<{ session: string; run: string; position: string }>

export function decodeSessionExecution(output: JsonValue): SessionExecution | null | 'malformed' {
  if (output === null) return null
  const value = recordOf(output)
  const session = value?.['session']
  const run = value?.['run']
  const position = value?.['position']
  return typeof session === 'string' && typeof run === 'string' && typeof position === 'string'
    ? { session, run, position }
    : 'malformed'
}

export type SessionHistoryRoot = Readonly<{
  position: string
  sessionPosition: string
  published: string
  revision: string | null
  source: DurableEvidence
}>

export function decodeSessionHistoryRoot(output: JsonValue): SessionHistoryRoot | null {
  const value = recordOf(output)
  if (value === null) return null
  const decoded = decodeValue(value) as Record<string, unknown>
  const { position, sessionPosition, published, revision, source } = decoded
  return typeof position === 'string' &&
    typeof sessionPosition === 'string' &&
    typeof published === 'string' &&
    (typeof revision === 'string' || revision === null) &&
    typeof source === 'object' &&
    source !== null
    ? { position, sessionPosition, published, revision, source: source as DurableEvidence }
    : null
}

export type SessionWorkRead =
  | Readonly<{ kind: 'state'; snapshot: WorkSnapshot }>
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'behind' }>

export { readCachedSessionWork }

export {
  afterSessionCommit,
  registerSessionNotifier,
  type SessionCommitAnswer,
  type SessionCommitLanding,
} from './committed.ts'
export {
  planPublishedCount,
  publishedCountsOf,
  type PublishedCountPlan,
  type PublishedCounts,
} from './published-count.ts'

export function decodeSessionWork(output: JsonValue): SessionWorkRead | null {
  const value = recordOf(output)
  switch (value?.['kind']) {
    case 'state':
      return value['snapshot'] === undefined
        ? null
        : { kind: 'state', snapshot: decodeValue(value['snapshot']) as WorkSnapshot }
    case 'absent':
      return { kind: 'absent' }
    case 'behind':
      return { kind: 'behind' }
    default:
      return null
  }
}

export type SessionInputRead =
  | Readonly<{ kind: 'input'; value: Extract<RoutedInput, { kind: 'ordinary' }> }>
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'no-input' }>

export function decodeSessionInput(output: JsonValue): SessionInputRead | null {
  const value = recordOf(output)
  switch (value?.['kind']) {
    case 'input':
      return value['value'] === undefined
        ? null
        : {
            kind: 'input',
            value: decodeValue(value['value']) as Extract<RoutedInput, { kind: 'ordinary' }>,
          }
    case 'absent':
      return { kind: 'absent' }
    case 'no-input':
      return { kind: 'no-input' }
    default:
      return null
  }
}

export {
  SESSION_COMMIT_BASIS,
  SESSION_ORDINARY_BASIS,
  SessionCommitBasisSchema,
  sessionCommitCommands,
  sessionCommitDigest,
  type SessionCommitBasis,
} from './commit-basis.ts'
