// The `execution-record` participant module: the Agent facts of the execution record provider (the
// Agent Journal) as the second append-only family of the Session log (R2-D292), and the content
// blocks of the tenant (TB-04). It decides nothing of the Agent. In the commit transaction a
// publication does six things: it finds the original batch of the operation; it compares the
// publication count of the session and the head revision of the execution with the expected
// ones (the first gate); it appends the batch of facts at the next publication (the primary key is
// the second gate) with the content blocks the batch needs, once per tenant and digest; it writes
// the operation key, the head rows and the admissions the provider prepared; and it adds one to
// the publication count. Nothing is replaced and no answer is stored: an answer is derived from
// the batch of its operation. The fact bodies are opaque: it stores them as they came.
// Its `blobs` intent stores content blocks alone, before the facts that refer to them, for a block
// that does not fit one command with them.
// Its `preadmission` intent keeps the preadmission records: the intent of one handoff is saved
// before the provider answers, and its outcome is fixed once.
import { tenantCodec } from '@omne-harness/legal-identity'
import type { JsonValue } from '@omne-harness/sql-contract'
import type { ParticipantModule, ParticipantReply } from '@omne-harness/sql-contract/worker'
import {
  blobDigest,
  canonicalText,
  decodeValue,
  EXECUTION_BATCH_MAX_FACTS,
  EXECUTION_FACT_MAX_BYTES,
  sha256,
} from '../codec.ts'
import { findPreadmission, preadmissionRecord } from './read-preadmission.ts'
import { packText } from '@omne-harness/sql-contract/worker'
import { big, oneRow, text, type Executor, type Row } from './support.ts'

const PROTOCOL = '1'

type Json = Readonly<{ readonly [key: string]: JsonValue }>

function isJson(value: JsonValue | undefined): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const unsupported = (reason: string): ParticipantReply => ({
  kind: 'unsupported',
  basis: { reason },
})

type Boundary = Readonly<{
  execution: string
  revision: string
  receipt: JsonValue
  emittedThrough: string
  ended: JsonValue
}>
/** The event of a fact that is an event: its sequence, kinds and the projection Session reads. */
type Event = Readonly<{ sequence: string; kinds: readonly string[]; projection: Json }>
type Fact = Readonly<{ execution: string; kind: string; event: Event | null; body: string }>
type Blob = Readonly<{ digest: string; media: string; payload: string }>
type Admission = Readonly<{
  input: string
  execution: string
  operation: string
  accepted: JsonValue
  grant: JsonValue
  attachment: string
  attempt: string | null
}>
type Write = Readonly<{
  tenant: string
  session: string
  execution: string
  expected: string | null
  revision: string
  published: string
  operation: string
  digest: string
  facts: readonly Fact[]
  blobs: readonly Blob[]
  boundaries: readonly Boundary[]
  admissions: readonly Admission[]
}>

const INTEGER = /^(0|[1-9][0-9]{0,17})$/
const isText = (value: JsonValue | undefined): value is string =>
  typeof value === 'string' && value !== ''
const isInteger = (value: JsonValue | undefined): value is string =>
  typeof value === 'string' && INTEGER.test(value)
const utf8 = (value: string): number => Buffer.byteLength(value, 'utf8')

function listOf<T>(value: JsonValue | undefined, parse: (item: Json) => T | null): T[] | null {
  if (!Array.isArray(value)) return null
  const out: T[] = []
  for (const item of value as readonly JsonValue[]) {
    const parsed = isJson(item) ? parse(item) : null
    if (parsed === null) return null
    out.push(parsed)
  }
  return out
}

function tenantOf(raw: JsonValue | undefined): string | null {
  try {
    const encoded = tenantCodec.encode(decodeValue(raw ?? null) as never)
    return encoded.ok ? encoded.value : null
  } catch {
    return null
  }
}

function parseBoundary(item: Json): Boundary | null {
  const { execution, revision, emittedThrough } = item
  return isText(execution) && isInteger(revision) && isInteger(emittedThrough)
    ? {
        execution,
        revision,
        receipt: item['receipt'] ?? null,
        emittedThrough,
        ended: item['ended'] ?? null,
      }
    : null
}

/**
 * The event of a fact: a positive sequence, an evidence object as its source and text kinds.
 * `consequences`, `control` and `batch` pass as given; an absent `consequences` or `control` is
 * null (not decided, not a deferred control fact), an absent `batch` is left out.
 */
function parseEvent(raw: JsonValue | undefined): Event | null | 'malformed' {
  if (raw === undefined || raw === null) return null
  if (!isJson(raw)) return 'malformed'
  const { sequence, source, kinds } = raw
  if (!isInteger(sequence) || sequence === '0' || !isJson(source)) return 'malformed'
  if (!Array.isArray(kinds) || !kinds.every(kind => isText(kind))) return 'malformed'
  const projection: Record<string, JsonValue> = {
    source,
    consequences: raw['consequences'] ?? null,
    control: raw['control'] ?? null,
  }
  if (raw['batch'] !== undefined && raw['batch'] !== null) projection['batch'] = raw['batch']
  return { sequence, kinds: kinds as string[], projection }
}

/** One fact of the batch; its execution is the write's when it names none. */
function parseFact(execution: string): (item: Json) => Fact | null {
  return item => {
    const owner = item['execution'] ?? execution
    const { kind } = item
    const event = parseEvent(item['event'])
    if (!isText(owner) || !isText(kind) || event === 'malformed' || !('body' in item)) return null
    const body = JSON.stringify(item['body'] ?? null)
    return utf8(body) > EXECUTION_FACT_MAX_BYTES ? null : { execution: owner, kind, event, body }
  }
}

/** A block whose digest is the digest of its payload; any other block is malformed. */
function parseBlob(item: Json): Blob | null {
  const { digest, media, payload } = item
  return isText(digest) &&
    isText(media) &&
    typeof payload === 'string' &&
    blobDigest(payload) === digest
    ? { digest, media, payload }
    : null
}

function parseAdmission(item: Json): Admission | null {
  const { input, execution, operation, attachment, attempt } = item
  // An absent attempt is a legacy or unnamed one; a present one must be a non-empty text.
  const named = attempt === undefined || attempt === null || isText(attempt)
  return isText(input) && isText(execution) && isText(operation) && isText(attachment) && named
    ? {
        input,
        execution,
        operation,
        accepted: item['accepted'] ?? null,
        grant: item['grant'] ?? null,
        attachment,
        attempt: attempt ?? null,
      }
    : null
}

type Head = Pick<
  Write,
  | 'tenant'
  | 'session'
  | 'execution'
  | 'expected'
  | 'revision'
  | 'published'
  | 'operation'
  | 'digest'
>

/** The identity and the expected counts of the write. */
function parseHead(raw: Json): Head | null {
  const tenant = tenantOf(raw['tenant'])
  const { session, execution, expected, revision, published, operation, digest } = raw
  if (
    tenant === null ||
    !isText(session) ||
    !isText(execution) ||
    !(expected === null || isInteger(expected)) ||
    !isInteger(revision) ||
    !isInteger(published) ||
    !isText(operation) ||
    !isText(digest)
  )
    return null
  return { tenant, session, execution, expected, revision, published, operation, digest }
}

/**
 * Parses the write at the boundary; a malformed one is unsupported and writes nothing. A batch
 * holds one to `EXECUTION_BATCH_MAX_FACTS` facts (the first is its envelope), each body at most
 * `EXECUTION_FACT_MAX_BYTES`, and no two events of one execution with one sequence.
 */
function parseWrite(raw: JsonValue | undefined): Write | null {
  if (!isJson(raw)) return null
  const head = parseHead(raw)
  if (head === null) return null
  const facts = listOf(raw['facts'], parseFact(head.execution))
  const blobs = listOf(raw['blobs'] ?? [], parseBlob)
  const boundaries = listOf(raw['boundaries'], parseBoundary)
  const admissions = listOf(raw['admissions'], parseAdmission)
  if (facts === null || blobs === null || boundaries === null || admissions === null) return null
  if (facts.length === 0 || facts.length > EXECUTION_BATCH_MAX_FACTS) return null
  const events = facts.flatMap(fact =>
    fact.event === null ? [] : [JSON.stringify([fact.execution, fact.event.sequence])],
  )
  if (new Set(events).size !== events.length) return null
  return { ...head, facts, blobs, boundaries, admissions }
}

const json = (value: JsonValue): string => JSON.stringify(value)

/**
 * Appends the batch at publication `pub`. A plain INSERT: a row already at one of these positions
 * (a writer that passed the count check at a taken position), an event sequence or an operation
 * already written makes the statement fail, and the storage rolls the whole commit back.
 */
function appendBatch(port: Executor, write: Write, pub: bigint): void {
  write.facts.forEach((fact, ord) =>
    port.execute(
      'INSERT INTO er_fact (tenant, session, pub, ord, execution, kind, eseq, op, kinds, event, body) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        write.tenant,
        write.session,
        pub,
        BigInt(ord),
        fact.execution,
        fact.kind,
        fact.event === null ? null : BigInt(fact.event.sequence),
        ord === 0 ? write.operation : null,
        json(fact.event?.kinds ?? []),
        fact.event === null ? null : packText(canonicalText(fact.event.projection)),
        packText(fact.body),
      ],
    ),
  )
}

/** Stores each block once per tenant and digest: a block the tenant holds is not written again. */
function storeBlobs(port: Executor, tenant: string, blobs: readonly Blob[]): void {
  for (const blob of blobs)
    port.execute(
      'INSERT OR IGNORE INTO sl_blob (tenant, digest, media, size, payload) VALUES (?, ?, ?, ?, ?)',
      [tenant, blob.digest, blob.media, BigInt(utf8(blob.payload)), packText(blob.payload)],
    )
}

function writeIndex(port: Executor, write: Write): void {
  const { tenant, session } = write
  for (const boundary of write.boundaries)
    port.execute(
      'INSERT OR REPLACE INTO er_execution (tenant, execution, session, revision, receipt, emitted_through, ended) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        tenant,
        boundary.execution,
        session,
        BigInt(boundary.revision),
        json(boundary.receipt),
        BigInt(boundary.emittedThrough),
        boundary.ended === null ? null : json(boundary.ended),
      ],
    )
  for (const admission of write.admissions) {
    const last = oneRow(
      port,
      'SELECT COALESCE(MAX(ordinal), -1) AS o FROM er_admission_idx WHERE tenant = ? AND session = ? AND input = ?',
      [tenant, session, admission.input],
    )
    const ordinal = big(last?.['o'] ?? -1n) + 1n
    port.execute(
      'INSERT INTO er_admission_idx (tenant, session, input, ordinal, execution, operation, accepted, grant_ref, attachment) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        tenant,
        session,
        admission.input,
        ordinal,
        admission.execution,
        admission.operation,
        json(admission.accepted),
        json(admission.grant),
        admission.attachment,
      ],
    )
    // The original attempt is a row beside the admission, with its key; none when it is not named.
    if (admission.attempt !== null)
      port.execute(
        'INSERT INTO er_admission_attempt_idx (tenant, session, input, ordinal, attempt) VALUES (?, ?, ?, ?, ?)',
        [tenant, session, admission.input, ordinal, admission.attempt],
      )
  }
}

function publish(port: Executor, write: Write): ParticipantReply {
  const { tenant, session, execution } = write
  // The original batch first: the provider tells a recall of the same operation by its digest
  // and derives the answer from the batch at `published`.
  const original = oneRow(
    port,
    'SELECT digest, published FROM er_operation WHERE tenant = ? AND operation = ? LIMIT 1',
    [tenant, write.operation],
  )
  if (original !== undefined)
    return {
      kind: 'conflict',
      basis: {
        kind: 'operation',
        digest: text(original['digest']),
        published: String(big(original['published'])),
      },
    }
  const root = oneRow(
    port,
    'SELECT published FROM er_root WHERE tenant = ? AND session = ? LIMIT 1',
    [tenant, session],
  )
  const published = root === undefined ? 0n : big(root['published'])
  const head = oneRow(
    port,
    'SELECT session, revision FROM er_execution WHERE tenant = ? AND execution = ? LIMIT 1',
    [tenant, execution],
  )
  const current = head === undefined ? null : text(head['revision'])
  // The first gate. An execution of the same identity in another session is a conflict too.
  if (
    published !== BigInt(write.published) ||
    current !== write.expected ||
    (head !== undefined && text(head['session']) !== session)
  )
    return {
      kind: 'conflict',
      basis: { kind: 'revision', revision: current, published: String(published) },
    }
  const next = published + 1n
  appendBatch(port, write, next)
  storeBlobs(port, tenant, write.blobs)
  port.execute(
    'INSERT INTO er_operation (tenant, operation, session, execution, digest, published) VALUES (?, ?, ?, ?, ?, ?)',
    [tenant, write.operation, session, execution, write.digest, next],
  )
  writeIndex(port, write)
  port.execute('INSERT OR REPLACE INTO er_root (tenant, session, published) VALUES (?, ?, ?)', [
    tenant,
    session,
    next,
  ])
  return { kind: 'participated', response: { published: String(next), digest: write.digest } }
}

/** The `blobs` intent: blocks alone, before the facts that refer to them. A block is not a fact. */
function blobs(port: Executor, raw: JsonValue | undefined): ParticipantReply {
  const tenant = isJson(raw) ? tenantOf(raw['tenant']) : null
  const list = isJson(raw) ? listOf(raw['blobs'], parseBlob) : null
  if (tenant === null || list === null || list.length === 0)
    return unsupported('the blocks are malformed')
  storeBlobs(port, tenant, list)
  return { kind: 'participated', response: { stored: list.map(blob => blob.digest) } }
}

// ---------------------------------------------------------------------------------------------
// Preadmission records

const optionalText = (value: JsonValue | undefined): value is string | null =>
  value === null || isText(value)

const digestOf = (value: JsonValue): string => `sha256:${sha256(canonicalText(value))}`

/** The members a saved intent carries; their content is opaque to this participant. */
const INTENT_MEMBERS = [
  'request',
  'origin',
  'principal',
  'qualification',
  'adoption',
  'materials',
] as const

type IntentWrite = Readonly<{
  tenant: string
  handoff: string
  entry: string | null
  session: string | null
  execution: string | null
  intent: Json
}>
type OutcomeWrite = Readonly<{ tenant: string; handoff: string; outcome: Json }>

function parseIntent(raw: Json, tenant: string): IntentWrite | null {
  const { handoff, entry, session, execution, intent } = raw
  return isText(handoff) &&
    optionalText(entry) &&
    optionalText(session) &&
    optionalText(execution) &&
    isJson(intent) &&
    INTENT_MEMBERS.every(member => member in intent)
    ? { tenant, handoff, entry, session, execution, intent }
    : null
}

function parseOutcome(raw: Json, tenant: string): OutcomeWrite | null {
  const { handoff, outcome } = raw
  return isText(handoff) &&
    isJson(outcome) &&
    (outcome['kind'] === 'prepared' || outcome['kind'] === 'rejected')
    ? { tenant, handoff, outcome }
    : null
}

const saved = (created: boolean, row: Row): ParticipantReply => ({
  kind: 'participated',
  response: { kind: 'saved', created, record: preadmissionRecord(row) },
})
const preadmissionConflict = (row: Row): ParticipantReply => ({
  kind: 'conflict',
  basis: { kind: 'preadmission', record: preadmissionRecord(row) },
})

/**
 * SaveIntent: the record of the same Ki is the answer as it is, whatever its H; then the record of
 * the same H recalls when its intent is the same and conflicts otherwise; else one new record.
 */
function saveIntent(port: Executor, write: IntentWrite): ParticipantReply {
  const { tenant, handoff, entry } = write
  const sameEntry = entry === null ? undefined : findPreadmission(port, tenant, { entry })
  if (sameEntry !== undefined) return saved(false, sameEntry)
  const digest = digestOf(write.intent)
  const sameHandoff = findPreadmission(port, tenant, { handoff })
  if (sameHandoff !== undefined)
    return text(sameHandoff['intent_digest']) === digest
      ? saved(false, sameHandoff)
      : preadmissionConflict(sameHandoff)
  port.execute(
    'INSERT INTO er_preadmission (tenant, handoff, entry, session, execution, intent, intent_digest, outcome, outcome_digest) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)',
    [tenant, handoff, entry, write.session, write.execution, canonicalText(write.intent), digest],
  )
  const row = findPreadmission(port, tenant, { handoff })
  return row === undefined
    ? { kind: 'failed', diagnostic: 'the saved preadmission record does not read back' }
    : saved(true, row)
}

/** Commit: the outcome of a saved intent is fixed once; the same outcome recalls, another conflicts. */
function fixOutcome(port: Executor, write: OutcomeWrite): ParticipantReply {
  const { tenant, handoff } = write
  const held = findPreadmission(port, tenant, { handoff })
  if (held === undefined)
    return {
      kind: 'conflict',
      basis: { kind: 'invalid', reason: 'no saved intent for the handoff' },
    }
  const digest = digestOf(write.outcome)
  const fixed = held['outcome_digest']
  if (fixed !== null && fixed !== undefined)
    return text(fixed) === digest ? saved(false, held) : preadmissionConflict(held)
  port.execute(
    'UPDATE er_preadmission SET outcome = ?, outcome_digest = ? WHERE tenant = ? AND handoff = ? AND outcome IS NULL',
    [canonicalText(write.outcome), digest, tenant, handoff],
  )
  const row = findPreadmission(port, tenant, { handoff })
  return row === undefined
    ? { kind: 'failed', diagnostic: 'the fixed preadmission outcome does not read back' }
    : saved(true, row)
}

function preadmission(
  port: Executor,
  facts: Readonly<Record<string, JsonValue>>,
): ParticipantReply {
  const raw = facts['write']
  const tenant = isJson(raw) ? tenantOf(raw['tenant']) : null
  if (!isJson(raw) || tenant === null) return unsupported('the preadmission write is malformed')
  switch (facts['phase']) {
    case 'intent': {
      const write = parseIntent(raw, tenant)
      return write === null
        ? unsupported('the preadmission intent is malformed')
        : saveIntent(port, write)
    }
    case 'outcome': {
      const write = parseOutcome(raw, tenant)
      return write === null
        ? unsupported('the preadmission outcome is malformed')
        : fixOutcome(port, write)
    }
    default:
      return unsupported('the preadmission phase is neither intent nor outcome')
  }
}

const participant: ParticipantModule = {
  participant: 'execution-record',
  protocol: PROTOCOL,
  execute(facts, port) {
    if (facts['intent'] === 'preadmission') return preadmission(port, facts)
    if (facts['intent'] === 'blobs') return blobs(port, facts['write'])
    if (facts['intent'] !== 'publish')
      return unsupported('the facts are neither a publication, blocks nor a preadmission')
    const write = parseWrite(facts['write'])
    if (write === null) return unsupported('the publication is malformed')
    return publish(port, write)
  },
}
export default participant
