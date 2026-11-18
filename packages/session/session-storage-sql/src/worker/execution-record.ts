import { tenantCodec } from '@omne-harness/legal-identity'
import type { JsonValue } from '@omne-harness/sql-contract'
import type { ParticipantModule, ParticipantReply } from '@omne-harness/sql-contract/worker'
import {
  blobDigest,
  canonicalText,
  decodeValue,
  EXECUTION_BATCH_MAX_FACTS,
  EXECUTION_FACT_MAX_BYTES,
  EXECUTION_ITEM_MAX_BYTES,
  sha256,
} from '../codec.ts'
import { findPreadmission, preadmissionRecord } from './read-preadmission.ts'
import { packText } from '@omne-harness/sql-contract/worker'
import { big, oneRow, text, type Executor, type Row } from './support.ts'
import { storeSharedBlob } from './shared-blobs.ts'

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
type Event = Readonly<{ sequence: string; kinds: readonly string[]; projection: Json }>
type Fact = Readonly<{ execution: string; kind: string; event: Event | null; body: string }>
type Blob = Readonly<{ digest: string; media: string; payload: string }>
// One item of an execution view this publication opens or changes; `open` is its state after it.
type Item = Readonly<{
  execution: string
  family: string
  item: string
  change: 'opened' | 'changed'
  open: boolean
  body: string
}>
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
  items: readonly Item[]
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

function parseBlob(item: Json): Blob | null {
  const { digest, media, payload } = item
  return isText(digest) &&
    isText(media) &&
    typeof payload === 'string' &&
    blobDigest(payload) === digest
    ? { digest, media, payload }
    : null
}

function parseItem(execution: string): (item: Json) => Item | null {
  return raw => {
    const owner = raw['execution'] ?? execution
    const { family, item, change, open } = raw
    if (!isText(owner) || !isText(family) || typeof item !== 'string' || !('body' in raw))
      return null
    if ((change !== 'opened' && change !== 'changed') || typeof open !== 'boolean') return null
    const body = JSON.stringify(raw['body'] ?? null)
    return utf8(body) > EXECUTION_ITEM_MAX_BYTES
      ? null
      : { execution: owner, family, item, change, open, body }
  }
}

function parseAdmission(item: Json): Admission | null {
  const { input, execution, operation, attachment, attempt } = item
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

function brokenItem(raw: JsonValue | undefined, execution: string): string {
  if (!Array.isArray(raw)) return 'the items are not a list'
  const parse = parseItem(execution)
  const found = (raw as readonly JsonValue[]).find(item => !isJson(item) || parse(item) === null)
  if (!isJson(found)) return 'an item is not an object'
  const bytes = utf8(JSON.stringify(found['body'] ?? null))
  return `the item ${String(found['family'])}/${String(found['item'])} of ${String(bytes)} bytes`
}

// A publication, or the first rule it breaks: a refusal that does not name its rule cannot be told
// from any other.
function parseWrite(raw: JsonValue | undefined): Write | string {
  if (!isJson(raw)) return 'not an object'
  const head = parseHead(raw)
  if (head === null) return 'the head'
  const facts = listOf(raw['facts'], parseFact(head.execution))
  const blobs = listOf(raw['blobs'] ?? [], parseBlob)
  const items = listOf(raw['items'] ?? [], parseItem(head.execution))
  const boundaries = listOf(raw['boundaries'], parseBoundary)
  const admissions = listOf(raw['admissions'], parseAdmission)
  if (facts === null) return 'a fact'
  if (blobs === null) return 'a blob'
  if (items === null) return brokenItem(raw['items'], head.execution)
  if (boundaries === null) return 'a boundary'
  if (admissions === null) return 'an admission'
  if (facts.length === 0) return 'no fact'
  if (facts.length > EXECUTION_BATCH_MAX_FACTS) return `${String(facts.length)} facts in one batch`
  const events = facts.flatMap(fact =>
    fact.event === null ? [] : [JSON.stringify([fact.execution, fact.event.sequence])],
  )
  if (new Set(events).size !== events.length) return 'two facts emit one event'
  const keys = items.map(item => JSON.stringify([item.execution, item.family, item.item]))
  const twice = keys.find((key, at) => keys.indexOf(key) !== at)
  if (twice !== undefined) return `the item ${twice} is written twice`
  return { ...head, facts, blobs, items, boundaries, admissions }
}

const json = (value: JsonValue): string => JSON.stringify(value)

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

const ITEM_KEY = 'tenant = ? AND execution = ? AND family = ? AND item = ?'

// An item opens once and only an open item changes: the first item of the publication that breaks
// this, with what the store holds for its key, or null when every item holds.
function itemConflict(port: Executor, write: Write): ParticipantReply | null {
  for (const item of write.items) {
    const row = oneRow(port, `SELECT open FROM er_item WHERE ${ITEM_KEY} LIMIT 1`, [
      write.tenant,
      item.execution,
      item.family,
      item.item,
    ])
    const held = row === undefined ? 'none' : big(row['open']) === 1n ? 'open' : 'closed'
    if (item.change === 'opened' ? held === 'none' : held === 'open') continue
    return {
      kind: 'conflict',
      basis: {
        kind: 'item',
        execution: item.execution,
        family: item.family,
        item: item.item,
        held,
      },
    }
  }
  return null
}

function writeItems(port: Executor, write: Write, pub: bigint): void {
  for (const item of write.items) {
    const open = item.open ? 1n : 0n
    const body = packText(item.body)
    if (item.change === 'opened') {
      port.execute(
        'INSERT INTO er_item (tenant, execution, family, item, open, pub, body) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [write.tenant, item.execution, item.family, item.item, open, pub, body],
      )
      continue
    }
    const changed = port.execute(
      `UPDATE er_item SET open = ?, pub = ?, body = ? WHERE ${ITEM_KEY} AND open = 1`,
      [open, pub, body, write.tenant, item.execution, item.family, item.item],
    )
    if (changed.changes !== 1n)
      throw new Error('an open item checked in this publication did not change')
  }
}

function storeBlobs(port: Executor, tenant: string, blobs: readonly Blob[]): void {
  for (const blob of blobs) storeSharedBlob(port, tenant, blob)
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
    if (admission.attempt !== null)
      port.execute(
        'INSERT INTO er_admission_attempt_idx (tenant, session, input, ordinal, attempt) VALUES (?, ?, ?, ?, ?)',
        [tenant, session, admission.input, ordinal, admission.attempt],
      )
  }
}

function publish(port: Executor, write: Write): ParticipantReply {
  const { tenant, session, execution } = write
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
  if (
    published !== BigInt(write.published) ||
    current !== write.expected ||
    (head !== undefined && text(head['session']) !== session)
  )
    return {
      kind: 'conflict',
      basis: { kind: 'revision', revision: current, published: String(published) },
    }
  const refused = itemConflict(port, write)
  if (refused !== null) return refused
  const next = published + 1n
  appendBatch(port, write, next)
  writeItems(port, write, next)
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

function blobs(port: Executor, raw: JsonValue | undefined): ParticipantReply {
  const tenant = isJson(raw) ? tenantOf(raw['tenant']) : null
  const list = isJson(raw) ? listOf(raw['blobs'], parseBlob) : null
  if (tenant === null || list === null || list.length === 0)
    return unsupported('the blocks are malformed')
  storeBlobs(port, tenant, list)
  return { kind: 'participated', response: { stored: list.map(blob => blob.digest) } }
}

const optionalText = (value: JsonValue | undefined): value is string | null =>
  value === null || isText(value)

const digestOf = (value: JsonValue): string => `sha256:${sha256(canonicalText(value))}`

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
    if (typeof write === 'string') return unsupported(`the publication is malformed: ${write}`)
    return publish(port, write)
  },
}
export default participant
