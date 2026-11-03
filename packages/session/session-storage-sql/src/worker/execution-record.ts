// The `execution-record` participant module: the records of the execution record provider (the
// Agent Journal) in the Session log's transaction domain. In the commit transaction it does six
// things and decides nothing of the Agent: it finds the execution row, compares the head revision
// and the publication count with the expected ones, inserts the original answer under its unique
// operation, replaces the opaque state (whole, or the parts the write names), writes the index rows
// the provider prepared, and adds one to the publication count. The state, its parts and the
// answers are opaque: it stores them as they came.
// Its second intent keeps the preadmission records (`preadmission`): the intent of one handoff is
// saved before the provider answers, and its outcome is fixed once.
import { tenantCodec } from '@omne-harness/legal-identity'
import type { JsonValue } from '@omne-harness/sql-contract'
import type { ParticipantModule, ParticipantReply } from '@omne-harness/sql-contract/worker'
import { canonicalText, decodeValue, sha256 } from '../codec.ts'
import { findPreadmission, preadmissionRecord } from './read-preadmission.ts'
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
type Fact = Readonly<{ execution: string; sequence: string; source: JsonValue; kinds: JsonValue }>
type Batch = Readonly<{ execution: string; sequence: string; source: JsonValue; batch: JsonValue }>
type Admission = Readonly<{
  input: string
  execution: string
  operation: string
  accepted: JsonValue
  grant: JsonValue
  attachment: string
  attempt: string | null
}>
/** One named part of the opaque state; `state` null drops the part. */
type Part = Readonly<{ part: string; state: JsonValue | null }>
type Write = Readonly<{
  tenant: string
  session: string
  execution: string
  expected: string | null
  revision: string
  published: string
  operation: string
  digest: string
  answer: JsonValue
  /**
   * The whole state (`kind: 'whole'`), or the parts this write changes (`kind: 'parts'`); with
   * `replace` the parts are the whole state and every part the write does not name goes.
   */
  state:
    | Readonly<{ kind: 'whole'; state: JsonValue }>
    | Readonly<{ kind: 'parts'; parts: readonly Part[]; replace: boolean }>
  boundaries: readonly Boundary[]
  facts: readonly Fact[]
  batches: readonly Batch[]
  admissions: readonly Admission[]
}>

const INTEGER = /^(0|[1-9][0-9]{0,17})$/
const isText = (value: JsonValue | undefined): value is string =>
  typeof value === 'string' && value !== ''
const isInteger = (value: JsonValue | undefined): value is string =>
  typeof value === 'string' && INTEGER.test(value)

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

function parseFact(item: Json): Fact | null {
  const { execution, sequence, kinds } = item
  return isText(execution) && isInteger(sequence) && Array.isArray(kinds)
    ? { execution, sequence, source: item['source'] ?? null, kinds }
    : null
}

function parseBatch(item: Json): Batch | null {
  const { execution, sequence } = item
  return isText(execution) && isInteger(sequence)
    ? { execution, sequence, source: item['source'] ?? null, batch: item['batch'] ?? null }
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

function parsePart(item: Json): Part | null {
  const { part } = item
  return isText(part) && 'state' in item ? { part, state: item['state'] ?? null } : null
}

/** The whole state or its parts: exactly one of `state` and `parts`, never both. */
function parseState(raw: Json): Write['state'] | null {
  if ('parts' in raw) {
    if ('state' in raw) return null
    const parts = listOf(raw['parts'], parsePart)
    const replace = raw['replace'] ?? false
    if (parts === null || typeof replace !== 'boolean') return null
    if (new Set(parts.map(item => item.part)).size !== parts.length) return null
    return { kind: 'parts', parts, replace }
  }
  return 'state' in raw ? { kind: 'whole', state: raw['state'] ?? null } : null
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
  | 'answer'
>

/** The identity, the expected counts and the original answer of the write. */
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
    !isText(digest) ||
    !('answer' in raw)
  )
    return null
  return {
    tenant,
    session,
    execution,
    expected,
    revision,
    published,
    operation,
    digest,
    answer: raw['answer'] ?? null,
  }
}

/** Parses the write at the boundary; a malformed one is unsupported and writes nothing. */
function parseWrite(raw: JsonValue | undefined): Write | null {
  if (!isJson(raw)) return null
  const head = parseHead(raw)
  const state = parseState(raw)
  if (head === null || state === null) return null
  const boundaries = listOf(raw['boundaries'], parseBoundary)
  const facts = listOf(raw['facts'], parseFact)
  const batches = listOf(raw['batches'], parseBatch)
  const admissions = listOf(raw['admissions'], parseAdmission)
  if (boundaries === null || facts === null || batches === null || admissions === null) return null
  return { ...head, state, boundaries, facts, batches, admissions }
}

const json = (value: JsonValue): string => JSON.stringify(value)

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
  for (const fact of write.facts)
    port.execute(
      'INSERT INTO er_fact_idx (tenant, execution, sequence, session, source, kinds) VALUES (?, ?, ?, ?, ?, ?)',
      [tenant, fact.execution, BigInt(fact.sequence), session, json(fact.source), json(fact.kinds)],
    )
  for (const batch of write.batches)
    port.execute(
      'INSERT INTO er_batch_idx (tenant, execution, sequence, session, source, batch) VALUES (?, ?, ?, ?, ?, ?)',
      [
        tenant,
        batch.execution,
        BigInt(batch.sequence),
        session,
        json(batch.source),
        json(batch.batch),
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

/**
 * The whole state replaces the state of the session and drops its parts. Parts replace or drop the
 * parts they name; with `replace` the whole state and every other part go first. A dropped part is
 * kept as a row with a NULL state, marked with the count `next`, as every part this write writes.
 */
function writeState(port: Executor, write: Write, next: bigint): void {
  const { tenant, session, state } = write
  const scope = [tenant, session]
  const dropAll = () =>
    port.execute(
      'UPDATE er_state_part SET state = NULL, published = ? WHERE tenant = ? AND session = ? AND state IS NOT NULL',
      [next, ...scope],
    )
  if (state.kind === 'whole') {
    port.execute('INSERT OR REPLACE INTO er_state (tenant, session, state) VALUES (?, ?, ?)', [
      ...scope,
      json(state.state),
    ])
    dropAll()
    return
  }
  if (state.replace) {
    port.execute('DELETE FROM er_state WHERE tenant = ? AND session = ?', scope)
    dropAll()
  }
  for (const part of state.parts)
    port.execute(
      'INSERT OR REPLACE INTO er_state_part (tenant, session, part, state, published) VALUES (?, ?, ?, ?, ?)',
      [...scope, part.part, part.state === null ? null : json(part.state), next],
    )
}

function publish(port: Executor, write: Write): ParticipantReply {
  const { tenant, session, execution } = write
  // The original answer first: the provider tells a recall of the same operation by its digest.
  const original = oneRow(
    port,
    'SELECT digest, answer FROM er_operation WHERE tenant = ? AND operation = ? LIMIT 1',
    [tenant, write.operation],
  )
  if (original !== undefined)
    return {
      kind: 'conflict',
      basis: {
        kind: 'operation',
        digest: text(original['digest']),
        answer: JSON.parse(text(original['answer'])) as JsonValue,
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
  // An execution of the same identity in another session is a conflict too: nothing is written.
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
  port.execute(
    'INSERT INTO er_operation (tenant, operation, session, execution, digest, answer, published) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [tenant, write.operation, session, execution, write.digest, json(write.answer), next],
  )
  writeState(port, write, next)
  writeIndex(port, write)
  port.execute('INSERT OR REPLACE INTO er_root (tenant, session, published) VALUES (?, ?, ?)', [
    tenant,
    session,
    next,
  ])
  return { kind: 'participated', response: { published: String(next), digest: write.digest } }
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
    if (facts['intent'] !== 'publish')
      return unsupported('the facts are neither a publication nor a preadmission')
    const write = parseWrite(facts['write'])
    if (write === null) return unsupported('the publication is malformed')
    return publish(port, write)
  },
}
export default participant
