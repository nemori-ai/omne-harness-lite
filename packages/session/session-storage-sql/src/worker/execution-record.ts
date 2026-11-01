// The `execution-record` participant module: the records of the execution record provider (the
// Agent Journal) in the Session log's transaction domain. In the commit transaction it does six
// things and decides nothing of the Agent: it finds the execution row, compares the head revision
// and the publication count with the expected ones, inserts the original answer under its unique
// operation, replaces the opaque state, writes the index rows the provider prepared, and adds one
// to the publication count. The state and the answers are opaque: it stores them as they came.
import { tenantCodec } from '@omne-harness/legal-identity'
import type { JsonValue } from '@omne-harness/sql-contract'
import type { ParticipantModule, ParticipantReply } from '@omne-harness/sql-contract/worker'
import { decodeValue } from '../codec.ts'
import { big, oneRow, text, type Executor } from './support.ts'

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
  answer: JsonValue
  state: JsonValue
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
  const { input, execution, operation, attachment } = item
  return isText(input) && isText(execution) && isText(operation) && isText(attachment)
    ? {
        input,
        execution,
        operation,
        accepted: item['accepted'] ?? null,
        grant: item['grant'] ?? null,
        attachment,
      }
    : null
}

/** Parses the write at the boundary; a malformed one is unsupported and writes nothing. */
function parseWrite(raw: JsonValue | undefined): Write | null {
  if (!isJson(raw)) return null
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
    !('answer' in raw) ||
    !('state' in raw)
  )
    return null
  const boundaries = listOf(raw['boundaries'], parseBoundary)
  const facts = listOf(raw['facts'], parseFact)
  const batches = listOf(raw['batches'], parseBatch)
  const admissions = listOf(raw['admissions'], parseAdmission)
  if (boundaries === null || facts === null || batches === null || admissions === null) return null
  if (!boundaries.some(boundary => boundary.execution === execution)) return null
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
    state: raw['state'] ?? null,
    boundaries,
    facts,
    batches,
    admissions,
  }
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
    port.execute(
      'INSERT INTO er_admission_idx (tenant, session, input, ordinal, execution, operation, accepted, grant_ref, attachment) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        tenant,
        session,
        admission.input,
        big(last?.['o'] ?? -1n) + 1n,
        admission.execution,
        admission.operation,
        json(admission.accepted),
        json(admission.grant),
        admission.attachment,
      ],
    )
  }
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
  port.execute('INSERT OR REPLACE INTO er_state (tenant, session, state) VALUES (?, ?, ?)', [
    tenant,
    session,
    json(write.state),
  ])
  writeIndex(port, write)
  port.execute('INSERT OR REPLACE INTO er_root (tenant, session, published) VALUES (?, ?, ?)', [
    tenant,
    session,
    next,
  ])
  return { kind: 'participated', response: { published: String(next) } }
}

const participant: ParticipantModule = {
  participant: 'execution-record',
  protocol: PROTOCOL,
  execute(facts, port) {
    if (facts['intent'] !== 'publish') return unsupported('the facts are not a publication')
    const write = parseWrite(facts['write'])
    if (write === null) return unsupported('the publication is malformed')
    return publish(port, write)
  },
}
export default participant
