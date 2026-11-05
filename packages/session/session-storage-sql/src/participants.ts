// The participant vocabulary of the Session log combination: the participant names, their facts
// protocols, the builders of the facts a committer sends and the decoders of the replies and read
// outputs it gets back. The functions are pure functions over the data formats. This entry imports
// no provider implementation, so a committer outside this member (the Agent Journal provider) uses
// it without a dependency on `createSessionStorage` (IC-5).
import type {
  DurableEvidence,
  GuardCommand,
  RoutedInput,
  SessionCommand,
  SessionFailure,
  SessionId,
  WorkSnapshot,
} from '@omne-harness/session-contract'
import type { FactCommandV2, JsonValue, RecordedReply } from '@omne-harness/sql-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import { canonicalText, decodeValue, encodeValue, isCount, sha256 } from './codec.ts'
import { readCachedSessionWork, registerSessionWorkIndex, type WorkFold } from './work-cache.ts'

/** The participant that executes the Session commands and the read-only checks. */
export const SESSION_PARTICIPANT = 'session'
/** The participant that keeps the records of the execution record provider (the Agent Journal). */
export const EXECUTION_RECORD_PARTICIPANT = 'execution-record'
/**
 * The participants of every Session log combination, in the execution order the storage fixes for
 * them (sql-contract SPEC 7.4: no fact dependency, so ascending names). `execution-record` runs
 * first, so the `session` participant of a joint commit reads the records of the same commit.
 */
export const SESSION_LOG_PARTICIPANTS: readonly [
  typeof EXECUTION_RECORD_PARTICIPANT,
  typeof SESSION_PARTICIPANT,
] = [EXECUTION_RECORD_PARTICIPANT, SESSION_PARTICIPANT]

export const SESSION_PROTOCOL = '1'
export const EXECUTION_RECORD_PROTOCOL = '1'

/** The read handler that reads the common log root G in one snapshot. */
export const SESSION_HISTORY_ROOT_HANDLER = 'session.history-root'
/** The read handler of the authoritative snapshot of one session (input: tenant and session). */
export const SESSION_WORK_HANDLER = 'session.work'
/** The read handler of one ordinary input of one session (input: tenant, session and input). */
export const SESSION_INPUT_HANDLER = 'session.input'
/**
 * The read handler of the execution index (input: tenant and execution): the session, the Run and
 * the SE13 position of the execution, or null when no Run of the tenant started it.
 */
export const SESSION_EXECUTION_HANDLER = 'session.execution'
/** The read handlers of the execution record participant. */
export const EXECUTION_RECORD_HANDLERS = {
  /**
   * The batches of the fact family of one session after a publication, one page at a time
   * (`ExecutionRecordFactsRead`, `decodeExecutionRecordFacts`): the incremental read of a view.
   */
  facts: 'execution-record.facts',
  /** The open executions of one session (`ExecutionRecordOpenRead`): the cold start of a view. */
  openExecutions: 'execution-record.open-executions',
  /**
   * The head row of one execution and its events after a sequence, one page at a time
   * (`ExecutionRecordEventsRead`, `decodeExecutionRecordEvents`).
   */
  events: 'execution-record.events',
  /** The operation key and the facts of its batch (`decodeExecutionRecordOperation`). */
  operation: 'execution-record.operation',
  /** One content block of the tenant by digest (`ExecutionRecordBlobRead`). */
  blob: 'execution-record.blob',
  /** One preadmission record, by tenant and handoff or by tenant and entry (`PreadmissionRead`). */
  preadmission: 'execution-record.preadmission',
} as const

// ---------------------------------------------------------------------------------------------
// The `session` participant

/** The facts of one Session command with its guards, as `createSessionStorage` sends them. */
export function sessionCommandFacts(
  command: SessionCommand,
  guards: readonly GuardCommand[],
): FactCommandV2 {
  return {
    participant: SESSION_PARTICIPANT,
    facts: { intent: 'command', command: encodeValue(command), guards: encodeValue(guards) },
  }
}

/**
 * One ordinary input as Session admitted it (SE10, SE11): the identity, the origin and the message.
 * In the `open` and `submit` checks, `origin` carries the source basis of the Agent's
 * `AcceptedInput` (its `source`), not the origin Session recorded for the input.
 */
export type SessionAdmittedInput = Pick<
  Extract<RoutedInput, { kind: 'ordinary' }>,
  'input' | 'origin' | 'message'
>

type CheckScope = Readonly<{ tenant: TenantId; session: SessionId; execution: string }>

/**
 * The read-only participations of the `session` participant (session-contract JC-26 and JC-27).
 * They write no Session entry.
 *
 * - `open`: PA-01 item 1. `initial.origin` is a receipt of the committed SE13 that started this
 *   execution with the initial input as its first input, and the message is the one Session
 *   admitted. The grant names the attempt of the active Run that started this execution.
 * - `submit`: PA-01 item 2. `value.origin` is a receipt of the committed SE11 of the input, and the
 *   message is the one Session admitted. The active Run is the Run of this execution.
 * - `attach`: PA-01 item 3. The grant names the current attempt of the active Run of this
 *   execution (ordinary advance), or the last attempt granted before the cancel of the cancelled
 *   Run of this execution (cancel wind-down).
 * - `finish`: PA-02. `judgeCompletion` on this execution. `control` is the cancel control of a
 *   finish with cancel authorization, or null.
 */
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

/** The answer of a read-only check that holds. `attempt` is the attempt the grant names, if any. */
export type SessionCheckResult = Readonly<{
  kind: 'checked'
  attempt: string | null
  /** `wind-down` when an attach holds only by the cancel wind-down case of PA-01 item 3. */
  advance: 'ordinary' | 'wind-down' | null
}>

/** The facts of one read-only check. */
export function sessionCheckFacts(check: SessionCheck): FactCommandV2 {
  return {
    participant: SESSION_PARTICIPANT,
    facts: { intent: 'check', check: encodeValue(check) },
  }
}

/** The digest a check answer carries: the same check gives the same digest. */
export function sessionCheckDigest(check: SessionCheck): string {
  return `sha256:${sha256(canonicalText(encodeValue(check)))}`
}

/**
 * The reply of the `session` participant, decoded.
 *
 * - `participated`: the result of the command or check, whether it is the recall of a committed
 *   original, and the digest of the command or check it answers. A caller compares the digest
 *   with `commandDigest` (or `sessionCheckDigest`): equal is the same command, another digest is
 *   another command under the same identity.
 * - `stopped`: the Session failure the participant stopped on (a conflict reply).
 * - `failed`: the participant could not do its part (a dependency or storage failure).
 * - `unsupported`: the facts are not a command, a check, an entries commit or a query.
 */
export type SessionParticipation =
  | Readonly<{
      kind: 'participated'
      result: unknown
      recovered: boolean
      digest: string
      /** What a fresh batch tells the work cache (SPEC RT-04); absent on a recall. */
      work?: SessionWorkReply
    }>
  | Readonly<{ kind: 'stopped'; failure: SessionFailure }>
  | Readonly<{ kind: 'failed'; diagnostic: string }>
  | Readonly<{ kind: 'unsupported'; reason: string }>

/**
 * What a published Session batch tells the work cache of the main thread (C-TOPOLOGY §2.9): the
 * fold of the work cache (`WorkFold`), under the name of this vocabulary.
 */
export type SessionWorkReply = WorkFold

function workReplyOf(value: JsonValue | undefined): SessionWorkReply | undefined {
  const work = recordOf(value)
  if (work === null) return undefined
  const { tail, published, bytes, first, last, indexed, basis } = work
  const counts = [tail, published, first, last].every(isCount)
  if (!counts || typeof bytes !== 'number' || typeof indexed !== 'boolean') return undefined
  return {
    tail: tail as string,
    published: published as string,
    bytes,
    first: first as string,
    last: last as string,
    indexed,
    ...(basis === undefined ? {} : { basis }),
  }
}

function isJsonRecord(
  value: JsonValue | undefined,
): value is Readonly<{ readonly [key: string]: JsonValue }> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function recordOf(
  value: JsonValue | undefined,
): Readonly<{ readonly [key: string]: JsonValue }> | null {
  return isJsonRecord(value) ? value : null
}

export function decodeSessionReply(reply: RecordedReply): SessionParticipation {
  switch (reply.kind) {
    case 'participated': {
      const response = recordOf(reply.response)
      const digest = response?.['digest']
      if (response === null || typeof digest !== 'string')
        return { kind: 'failed', diagnostic: 'a session reply without a digest' }
      const work = workReplyOf(response['work'])
      return {
        kind: 'participated',
        result: decodeValue(response['result'] ?? null),
        recovered: response['recovered'] === true,
        digest,
        ...(work === undefined ? {} : { work }),
      }
    }
    case 'conflict': {
      const failure = recordOf(reply.basis)?.['failure']
      return failure === undefined
        ? { kind: 'failed', diagnostic: 'a session conflict without a failure' }
        : { kind: 'stopped', failure: decodeValue(failure) as SessionFailure }
    }
    case 'unsupported': {
      const reason = recordOf(reply.basis)?.['reason']
      return { kind: 'unsupported', reason: typeof reason === 'string' ? reason : 'unsupported' }
    }
    case 'failed':
      return { kind: 'failed', diagnostic: `${reply.category}: ${reply.diagnostic}` }
  }
}

// ---------------------------------------------------------------------------------------------
// The `execution-record` participant: the Agent fact family and the content blocks

export { blobDigest, EXECUTION_BATCH_MAX_FACTS, EXECUTION_FACT_MAX_BYTES } from './codec.ts'

/** The head of one execution after a write: the Agent side of the execution history boundary. */
export type ExecutionBoundaryRecord = Readonly<{
  execution: string
  revision: string
  /** The evidence of the original Agent commit that wrote this head (its `CommandReceipt`). */
  receipt: DurableEvidence
  emittedThrough: string
  ended: Readonly<{ sequence: string; source: DurableEvidence }> | null
}>

/**
 * The event projection of a fact that is an event: what Session reads of it (K-5, AD-02). Its
 * sequence is unique in its execution. `kinds` are its Session consequence kinds. `consequences`
 * is the JSON of the normalized consequences (absent or null: not decided), `control` the JSON of
 * the deferred control evidence (absent or null: none), `batch` the JSON of the batch of an
 * input-taken event (absent: not one). All three pass as given.
 */
export type ExecutionEventProjection = Readonly<{
  sequence: string
  source: DurableEvidence
  kinds: readonly string[]
  consequences?: JsonValue
  control?: JsonValue
  batch?: JsonValue
}>

/**
 * One fact of a batch. `execution` is the write's execution when absent. `kind` names the kind of
 * the fact; `body` is its JSON, opaque to this member, at most `EXECUTION_FACT_MAX_BYTES` UTF-8
 * bytes. A fact that is an event carries its projection in `event`.
 */
export type ExecutionFactRecord = Readonly<{
  execution?: string
  kind: string
  event?: ExecutionEventProjection
  body: JsonValue
}>

/**
 * One content block (TB-04): `payload` is its text, `digest` is `blobDigest(payload)` and `media`
 * its media type. A tenant holds one block per digest.
 */
export type ExecutionBlobRecord = Readonly<{ digest: string; media: string; payload: string }>

/** One original acceptance of an input by an open or a submit (the reverse input directory). */
export type ExecutionAdmissionRecord = Readonly<{
  input: string
  execution: string
  operation: string
  accepted: DurableEvidence
  grant: DurableEvidence
  attachment: string
  /**
   * The SE15 attempt the acceptance was granted under. Without it a Run with more than one SE15
   * cannot prove the original attempt of this row (`grant` is the Agent's receipt, not an SE15).
   */
  attempt?: string
}>

/**
 * One publication of the execution record provider: one batch of facts. The participant does six
 * things in the commit transaction. It finds the original batch of `operation`. It compares the
 * publication count of the session with `published` and the head revision of `execution` with
 * `expected` (the first gate). It appends `facts` at publication `published + 1`, the first fact
 * at place 0 as the envelope of the batch, which alone names `operation` (the primary key is the
 * second gate). It stores `blobs`, once per tenant and digest. It writes the operation key, the
 * head rows and the admissions. It adds one to the publication count.
 *
 * A batch holds one to `EXECUTION_BATCH_MAX_FACTS` facts. `revision` equal to `expected` is a
 * write that establishes no new revision of the execution. No answer is stored: the provider
 * derives the answer of an operation from its batch.
 */
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
  boundaries: readonly ExecutionBoundaryRecord[]
  admissions: readonly ExecutionAdmissionRecord[]
}>

/** The opaque members (each `body`, the event `consequences`, `control` and `batch`) pass as given. */
export function executionRecordFacts(write: ExecutionRecordWrite): FactCommandV2 {
  const { facts, blobs, ...rest } = write
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
      },
    },
  }
}

/**
 * Content blocks alone, before the facts that refer to them: for a block that does not fit one
 * command with its facts. A block without a fact that refers to it is not a fact.
 */
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

/**
 * The reply of the `execution-record` participant to a publication, decoded.
 *
 * - `published`: the batch is saved; `published` is its publication (the new count of the session)
 *   and `digest` the digest of the write's operation, so a recalled receipt tells its operation.
 * - `revision-conflict`: the head revision of the execution is not `expected`, or the publication
 *   count is not `published`. `revision` is the current head (null: no such execution) and
 *   `published` the current count.
 * - `operation-conflict`: the operation already has a batch. `digest` is its digest, `published`
 *   its publication: an equal digest is the recall of the same operation, whose answer the
 *   provider derives from that batch.
 */
export type ExecutionRecordParticipation =
  | Readonly<{ kind: 'published'; published: string; digest: string }>
  | Readonly<{ kind: 'revision-conflict'; revision: string | null; published: string }>
  | Readonly<{ kind: 'operation-conflict'; digest: string; published: string }>
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

/** The reply to a write of blocks alone: the digests stored or already held. */
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

/** One fact as the reads of the fact family give it. `event` and `body` are the JSON written. */
export type ExecutionFact = Readonly<{
  /** The place of the fact in its batch; 0 is the envelope. */
  ord: number
  execution: string
  kind: string
  /** The event sequence; null for a fact that is not an event. */
  sequence: string | null
  kinds: readonly string[]
  event: JsonValue
  body: JsonValue
}>

/** One batch: its publication, the operation its envelope names (null when not read) and facts. */
export type ExecutionBatch = Readonly<{
  published: string
  operation: string | null
  facts: readonly ExecutionFact[]
}>

/** A session or execution that is not of the tenant of the call, or does not exist. */
export type ExecutionRecordDenied = Readonly<{ kind: 'denied' }>
/**
 * The records of a session that are not all there: a session published before the fact family
 * (0.0.x moved no old record), or a gap after `after`. The reader answers `unavailable`.
 */
export type ExecutionRecordMissing = Readonly<{ kind: 'missing'; published: string }>

/**
 * The input of `execution-record.facts`: the batches after publication `after` ('0': all). With
 * `execution`, only the facts of that execution (a batch may then be part of its publication).
 */
export type ExecutionRecordFactsRead = Readonly<{
  tenant: string
  session: string
  after: string
  execution?: string | null
}>
/**
 * One page of `execution-record.facts`: the publication count of the snapshot, whole batches in
 * publication order, and the `after` of the next page (null: none). A read without `execution`
 * gives every publication after `after` through `published`, or answers `missing`.
 */
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

/** The `denied` and `missing` answers every session read of the fact family shares. */
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

/** The input of `execution-record.open-executions`: `after` the last execution of the last page. */
export type ExecutionRecordOpenRead = Readonly<{
  tenant: string
  session: string
  after?: string | null
}>
/** One open execution: its head revision, the evidence of its head and its last event. */
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

/** The input of `execution-record.events`: the events of `execution` after sequence `after`. */
export type ExecutionRecordEventsRead = Readonly<{
  tenant: string
  session: string
  execution: string
  after: string
}>
/** One event as `execution-record.events` gives it: its projection beside the opaque body. */
export type ExecutionEvent = Readonly<{
  sequence: string
  published: string
  ord: number
  kind: string
  kinds: readonly string[]
  source: JsonValue
  /** The normalized consequences; null: not decided. */
  consequences: JsonValue
  /** The deferred control evidence; null: none. */
  control: JsonValue
  /** The batch of an input-taken event; null: not one. */
  batch: JsonValue
  body: JsonValue
}>
/** One page of events with the head row of the execution, and the `after` of the next page. */
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

/** The input of `execution-record.blob`, and its output: the block, or `denied`. */
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

/**
 * The input of `execution-record.operation` and its output: the operation key and the facts of its
 * batch, or null when the tenant has no batch of the operation.
 */
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

// ---------------------------------------------------------------------------------------------
// The preadmission records of the `execution-record` participant

/**
 * The intent of one handoff, as the provider saves it before it answers: the complete request, its
 * origin, the stable identity of the original principal (never a credential), the qualification
 * basis, the adopted implementation and the materials. Every member is opaque JSON here.
 */
export type PreadmissionIntent = Readonly<{
  request: JsonValue
  origin: JsonValue
  principal: JsonValue
  qualification: JsonValue
  adoption: JsonValue
  materials: JsonValue
}>

/**
 * Phase one: save the intent of handoff `handoff` (H) under entry `entry` (Ki). A record of the same
 * Ki is the answer as it is, whatever its H; a record of the same H answers when its intent is the
 * same and conflicts otherwise. `session` and `execution` are null when there is no Run yet.
 */
export type PreadmissionIntentWrite = Readonly<{
  phase: 'intent'
  tenant: TenantId
  handoff: string
  entry: string | null
  session: SessionId | null
  execution: string | null
  intent: PreadmissionIntent
}>

/** The fixed result of one handoff: `prepared` or `rejected`, with opaque members. */
export type PreadmissionOutcome = Readonly<{ kind: 'prepared' | 'rejected' }> &
  Readonly<{ [key: string]: JsonValue }>

/** Phase two: fix the outcome of the saved intent of `handoff` once. */
export type PreadmissionOutcomeWrite = Readonly<{
  phase: 'outcome'
  tenant: TenantId
  handoff: string
  outcome: PreadmissionOutcome
}>

/** The opaque intent and outcome travel as they are; the tenant is encoded. */
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

/** One saved preadmission record. The digests are the participant's digests of the canonical JSON. */
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

/**
 * The reply of a preadmission write, decoded.
 *
 * - `saved`: the record after the write. `created` is true when this write saved the intent or
 *   fixed the outcome, false when the record already held it (a recall).
 * - `conflict`: the same H holds another intent, or another fixed outcome; `record` is the held one.
 * - `invalid`: an outcome without a saved intent.
 */
export type PreadmissionParticipation =
  | Readonly<{ kind: 'saved'; created: boolean; record: PreadmissionRecord }>
  | Readonly<{ kind: 'conflict'; record: PreadmissionRecord }>
  | Readonly<{ kind: 'invalid'; reason: string }>
  | Readonly<{ kind: 'failed'; diagnostic: string }>
  | Readonly<{ kind: 'unsupported'; reason: string }>

/** A `participated` preadmission reply: the saved record and whether this write saved it. */
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

/** A `conflict` preadmission reply: an outcome without an intent, or the held record. */
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

/** The input of `execution-record.preadmission`: the tenant text and exactly one of H or Ki. */
export type PreadmissionRead =
  | Readonly<{ tenant: string; handoff: string }>
  | Readonly<{ tenant: string; entry: string }>

// ---------------------------------------------------------------------------------------------
// The execution index

/** The input of `session.execution` and the output it gives (null: no Run of the tenant started it). */
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

// ---------------------------------------------------------------------------------------------
// The common log root

/**
 * The common log root G of one session, read in one snapshot: `position` is the Session position
 * (the last entry position) plus the Agent publication count, so a publication of either side
 * moves it forward. `source` covers both parts and the Session revision.
 */
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

// ---------------------------------------------------------------------------------------------
// The Session reads a committer needs before it prepares

/**
 * The output of `session.work`: the snapshot, `absent` when the session does not exist, `behind`
 * when the snapshot row does not cover the log tail (a read to retry, never an empty session).
 */
export type SessionWorkRead =
  | Readonly<{ kind: 'state'; snapshot: WorkSnapshot }>
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'behind' }>

/**
 * The `session.work` answer through the work cache of `storage` (SPEC RT-04), for a committer that
 * holds the domain of the tenant: the version of the session is read first, and the snapshot is
 * read whole only when no cached answer has that version. The snapshot it answers is deeply frozen.
 */
export { readCachedSessionWork }

/**
 * Replaces the index of the held `session.work` answer of one session after a publication of the
 * Agent records committed with the count `published` (SPEC RT-04): for the Journal provider, which
 * holds the domain of the tenant. It reads the index at the held tail and the new count, and
 * registers nothing when the store is at another version. It never throws.
 */
export { registerSessionWorkIndex }

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

/** The output of `session.input`: the admitted ordinary input, or why there is none. */
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
