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
import { canonicalText, decodeValue, encodeValue, sha256 } from './codec.ts'

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
/** The read handlers of the execution record participant. */
export const EXECUTION_RECORD_HANDLERS = {
  /** The publication count and the opaque state of the records of one session. */
  state: 'execution-record.state',
  /** The original answer of one operation. */
  operation: 'execution-record.operation',
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

/** One ordinary input as Session admitted it (SE10, SE11): the identity, the origin and the message. */
export type SessionAdmittedInput = Pick<
  Extract<RoutedInput, { kind: 'ordinary' }>,
  'input' | 'origin' | 'message'
>

type CheckScope = Readonly<{ tenant: TenantId; session: SessionId; execution: string }>

/**
 * The read-only participations of the `session` participant (session-contract JC-26 and JC-27).
 * They write no Session entry.
 *
 * - `open`: PA-01 item 1. The grant names the attempt of the active Run that started this
 *   execution, and the initial input is the one Session admitted.
 * - `submit`: PA-01 item 2. The input is the one Session admitted and the active Run is the Run of
 *   this execution.
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
  | Readonly<{ kind: 'participated'; result: unknown; recovered: boolean; digest: string }>
  | Readonly<{ kind: 'stopped'; failure: SessionFailure }>
  | Readonly<{ kind: 'failed'; diagnostic: string }>
  | Readonly<{ kind: 'unsupported'; reason: string }>

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
      return {
        kind: 'participated',
        result: decodeValue(response['result'] ?? null),
        recovered: response['recovered'] === true,
        digest,
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
// The `execution-record` participant

/** The head of one execution after a write: the Agent side of the execution history boundary. */
export type ExecutionBoundaryRecord = Readonly<{
  execution: string
  revision: string
  /** The evidence of the original Agent commit that wrote this head (its `CommandReceipt`). */
  receipt: DurableEvidence
  emittedThrough: string
  ended: Readonly<{ sequence: string; source: DurableEvidence }> | null
}>

/** One event of an execution: its sequence, original source and Session consequence kinds. */
export type ExecutionFactRecord = Readonly<{
  execution: string
  sequence: string
  source: DurableEvidence
  kinds: readonly string[]
}>

/** One input-taken batch of an execution, as its event wrote it. */
export type ExecutionBatchRecord = Readonly<{
  execution: string
  sequence: string
  source: DurableEvidence
  batch: JsonValue
}>

/** One original acceptance of an input by an open or a submit (the reverse input directory). */
export type ExecutionAdmissionRecord = Readonly<{
  input: string
  execution: string
  operation: string
  accepted: DurableEvidence
  grant: DurableEvidence
  attachment: string
}>

/**
 * One write of the execution record provider. The participant does six things in the commit
 * transaction: it finds the execution row by tenant and execution; it updates the head revision
 * only when it is `expected`; it inserts the original answer under the unique (tenant, operation);
 * it replaces the opaque state of the session's records; it writes the index rows; and it adds one
 * to the publication count of the session, only when the count is `published`.
 *
 * `revision` equal to `expected` is a write that establishes no new revision of the execution.
 * `state` and `answer` are opaque: the participant stores them and never decodes them.
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
  answer: JsonValue
  state: JsonValue
  boundaries: readonly ExecutionBoundaryRecord[]
  facts: readonly ExecutionFactRecord[]
  batches: readonly ExecutionBatchRecord[]
  admissions: readonly ExecutionAdmissionRecord[]
}>

/** The opaque members (`state`, `answer`, each `batch`) travel as they are; the rest is encoded. */
export function executionRecordFacts(write: ExecutionRecordWrite): FactCommandV2 {
  const { state, answer, batches, ...rest } = write
  const encoded = encodeValue(rest) as Readonly<Record<string, JsonValue>>
  return {
    participant: EXECUTION_RECORD_PARTICIPANT,
    facts: {
      intent: 'publish',
      write: {
        ...encoded,
        state,
        answer,
        batches: batches.map(({ batch, ...index }) => ({
          ...(encodeValue(index) as Readonly<Record<string, JsonValue>>),
          batch,
        })),
      },
    },
  }
}

/**
 * The reply of the `execution-record` participant, decoded.
 *
 * - `published`: the write is saved; `published` is the new publication count of the session and
 *   `digest` the digest of the write's operation, so a recalled receipt tells its operation.
 * - `revision-conflict`: the head revision of the execution is not `expected`, or the publication
 *   count is not `published`. `revision` is the current head (null: no such execution) and
 *   `published` the current count.
 * - `operation-conflict`: the operation already has an original answer. `digest` and `answer` are
 *   the original ones: an equal digest is the recall of the same operation.
 */
export type ExecutionRecordParticipation =
  | Readonly<{ kind: 'published'; published: string; digest: string }>
  | Readonly<{ kind: 'revision-conflict'; revision: string | null; published: string }>
  | Readonly<{ kind: 'operation-conflict'; digest: string; answer: JsonValue }>
  | Readonly<{ kind: 'failed'; diagnostic: string }>
  | Readonly<{ kind: 'unsupported'; reason: string }>

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
      if (
        basis?.['kind'] === 'revision' &&
        typeof published === 'string' &&
        (typeof revision === 'string' || revision === null)
      )
        return { kind: 'revision-conflict', revision, published }
      const digest = basis?.['digest']
      if (basis?.['kind'] === 'operation' && typeof digest === 'string')
        return { kind: 'operation-conflict', digest, answer: basis['answer'] ?? null }
      return { kind: 'failed', diagnostic: 'an execution-record conflict without a basis' }
    }
    case 'unsupported': {
      const reason = recordOf(reply.basis)?.['reason']
      return { kind: 'unsupported', reason: typeof reason === 'string' ? reason : 'unsupported' }
    }
    case 'failed':
      return { kind: 'failed', diagnostic: `${reply.category}: ${reply.diagnostic}` }
  }
}

/** The input of `execution-record.state` and the output it gives. */
export type ExecutionRecordStateRead = Readonly<{ tenant: string; session: string }>
export type ExecutionRecordState = Readonly<{ published: string; state: JsonValue | null }>

export function decodeExecutionRecordState(output: JsonValue): ExecutionRecordState | null {
  const value = recordOf(output)
  const published = value?.['published']
  return value === null || typeof published !== 'string'
    ? null
    : { published, state: value['state'] ?? null }
}

/** The input of `execution-record.operation` and the output it gives (null: no original). */
export type ExecutionRecordOperationRead = Readonly<{ tenant: string; operation: string }>
export type ExecutionRecordOperation = Readonly<{ digest: string; answer: JsonValue }>

export function decodeExecutionRecordOperation(
  output: JsonValue,
): ExecutionRecordOperation | null | 'malformed' {
  if (output === null) return null
  const value = recordOf(output)
  const digest = value?.['digest']
  return value === null || typeof digest !== 'string'
    ? 'malformed'
    : { digest, answer: value['answer'] ?? null }
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
