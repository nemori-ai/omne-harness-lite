import { createHash } from 'node:crypto'
import type {
  Adoption,
  AgentExecutionId,
  DurableEvidence,
  Failure,
  ModelReplyAdmission,
  ReplyAdmissionFrom,
  ReplyAdmissionGapReason,
  ReplyAdmissionItem,
  ReplyAdmissionPage,
  ReplyAdmissionPageCursor,
  ReplyAdmissionPrefix,
  ReplyAdmissionProjection,
  ReplyAdmissionRead,
  ReplyAdmissionSequence,
} from '@omne-harness/agent-contract'
import {
  decodeReplyAdmissionPageCursor,
  decodeReplyAdmissionSequence,
} from '@omne-harness/agent-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { AdmissionView } from '../journal/index.ts'
import { canonical } from './canonical.ts'
import { itemText, NeedItems, type ClosedTable, type ItemRef } from './closed-items.ts'
import { sameEvidence } from './journal-handoff-checks.ts'
import { admissionRecord } from './journal-records.ts'
// The reply admission ledger of an execution: its records by sequence, its projection, the pages a
// reader reads and the read positions a commit saves.

export type AdmissionRecord = Readonly<{
  fact: ModelReplyAdmission
  publication: DurableEvidence
  basis: DurableEvidence | null
  present: boolean
}>

export type AdmissionProjection = Readonly<{
  rule: Adoption
  consecutive: number
  total: number
  last: DurableEvidence | null
  sequence: number
  basis: DurableEvidence
}>

export type AdmissionLedger = Readonly<{
  origin: DurableEvidence | null
  retainedFrom: number
  rangesFrom: number
  projection: AdmissionProjection
}>

export type AdmissionScope = Readonly<{
  parts: readonly string[]
  owner: string
  mint(record: string, revision: number): DurableEvidence
}>

export type AdmissionCounters = {
  seeks: number
  scanned: number
  decoded: number
  pages: number
  folds: number
  loads: number
  checkpointWrites: number
}

export function admissionCounters(): AdmissionCounters {
  return { seeks: 0, scanned: 0, decoded: 0, pages: 0, folds: 0, loads: 0, checkpointWrites: 0 }
}

export type AdmissionDamage =
  | Readonly<{ kind: 'missing-fact'; sequence: number }>
  | Readonly<{ kind: 'missing-basis'; sequence: number }>
  | Readonly<{ kind: 'retention'; from: number }>
  | Readonly<{ kind: 'range-unavailable'; below: number }>

export type AdmissionPageLimits = Readonly<{ items: number | null; bytes: number | null }>

export const PREFIX = 'reply-admission-prefix'
export const RANGE = 'reply-admissions'
export const CURSOR = 'rac1.'

export function sequenceText(value: number): ReplyAdmissionSequence {
  const decoded = decodeReplyAdmissionSequence(String(value))
  if ('failure' in decoded) throw new Error(`memory Journal minted an invalid sequence: ${value}`)
  return decoded.ok
}

export function recordOf(scope: AdmissionScope, kind: string, sequence: number): string {
  return `${JSON.stringify(scope.parts)}/${kind}/${sequence}`
}

export function parseRecord(
  record: string,
  kind: string,
): Readonly<{ parts: readonly string[]; sequence: bigint }> | undefined {
  const marker = `/${kind}/`
  const at = record.lastIndexOf(marker)
  if (at < 0) return undefined
  const decoded = decodeReplyAdmissionSequence(record.slice(at + marker.length))
  if ('failure' in decoded) return undefined
  try {
    const parts: unknown = JSON.parse(record.slice(0, at))
    if (!Array.isArray(parts) || !parts.every(part => typeof part === 'string')) return undefined
    return { parts, sequence: BigInt(decoded.ok) }
  } catch {
    return undefined
  }
}

export function scopeFailure(
  scope: AdmissionScope,
  parts: readonly string[],
  field: string,
  action: string,
): Failure | undefined {
  if (parts[0] !== scope.parts[0]) return { kind: 'denied', action }
  if (canonical(parts) !== canonical(scope.parts))
    return { kind: 'invalid', field, reason: 'not of this execution' }
  return undefined
}

export function originLedger(scope: AdmissionScope, rule: Adoption, revision: number) {
  const origin = scope.mint(recordOf(scope, PREFIX, 0), revision)
  const ledger: AdmissionLedger = {
    origin,
    retainedFrom: 1,
    rangesFrom: 0,
    projection: { rule, consecutive: 0, total: 0, last: null, sequence: 0, basis: origin },
  }
  return ledger
}

export function stepProjection(
  projection: AdmissionProjection,
  fact: ModelReplyAdmission,
  basis: DurableEvidence,
): AdmissionProjection {
  return fact.decision === 'rejected'
    ? {
        ...projection,
        consecutive: projection.consecutive + 1,
        total: projection.total + 1,
        sequence: projection.sequence + 1,
        basis,
      }
    : {
        ...projection,
        consecutive: 0,
        last: fact.source,
        sequence: projection.sequence + 1,
        basis,
      }
}

export function admit(
  scope: AdmissionScope,
  ledger: AdmissionLedger,
  fact: ModelReplyAdmission,
  revision: number,
  publication: DurableEvidence,
): Readonly<{ record: AdmissionRecord; ledger: AdmissionLedger }> {
  const sequence = ledger.projection.sequence + 1
  const basis = scope.mint(recordOf(scope, PREFIX, sequence), revision)
  return {
    record: { fact, publication, basis, present: true },
    ledger: { ...ledger, projection: stepProjection(ledger.projection, fact, basis) },
  }
}

export function admissionKey(fact: ModelReplyAdmission): string {
  return JSON.stringify([fact.call, fact.resultVersion])
}

export function throughOf(scope: AdmissionScope, ledger: AdmissionLedger): DurableEvidence {
  const sequence = ledger.projection.sequence
  return scope.mint(recordOf(scope, RANGE, sequence), sequence)
}

export function admissionProjectionOf(
  scope: AdmissionScope,
  ledger: AdmissionLedger,
  rule: Adoption,
): Outcome<ReplyAdmissionProjection, Failure> {
  const projection = ledger.projection
  if (canonical(projection.rule) !== canonical(rule))
    return fail({
      kind: 'unavailable',
      owner: scope.owner,
      diagnostic: 'the reply admission rule changed without a conversion of the projection',
    })
  return succeed({
    through: throughOf(scope, ledger),
    rule: projection.rule,
    lastAdmission: projection.last,
    consecutiveDenials: String(projection.consecutive),
    totalDenials: String(projection.total),
    prefix: { sequence: sequenceText(projection.sequence), basis: projection.basis },
  })
}

export function rowsOf(
  records: readonly (AdmissionRecord | undefined)[],
  start: number,
  count: number,
  counters: AdmissionCounters,
): (AdmissionRecord | undefined)[] {
  if (count > 0) counters.seeks += 1
  const rows: (AdmissionRecord | undefined)[] = []
  for (let index = start; index < start + count && index < records.length; index += 1) {
    counters.scanned += 1
    rows.push(records[index])
  }
  return rows
}

export function rebuild(
  records: readonly (AdmissionRecord | undefined)[],
  ledger: AdmissionLedger,
  rule: Adoption,
  counters: AdmissionCounters,
): AdmissionProjection | undefined {
  if (ledger.origin === null || ledger.retainedFrom > 1) return undefined
  let projection: AdmissionProjection = {
    rule,
    consecutive: 0,
    total: 0,
    last: null,
    sequence: 0,
    basis: ledger.origin,
  }
  for (const row of rowsOf(records, 0, records.length, counters)) {
    counters.folds += 1
    if (row === undefined || !row.present || row.basis === null) return undefined
    projection = stepProjection(projection, row.fact, row.basis)
  }
  return projection
}

type Resolved =
  | Readonly<{ kind: 'resolved'; sequence: number }>
  | Readonly<{ kind: 'refused'; failure: Failure }>
  | Readonly<{ kind: 'missing'; sequence: number }>

export function resolvePrefix(
  scope: AdmissionScope,
  records: readonly (AdmissionRecord | undefined)[],
  ledger: AdmissionLedger,
  prefix: ReplyAdmissionPrefix,
  field: string,
  action: string,
  counters: AdmissionCounters,
): Resolved {
  const refused = (reason: string): Resolved => ({
    kind: 'refused',
    failure: { kind: 'invalid', field, reason },
  })
  if (prefix.basis.owner !== scope.owner) return refused('not a basis of this Journal')
  const parsed = parseRecord(prefix.basis.record, PREFIX)
  if (parsed === undefined) return refused('not a prefix basis')
  const scoped = scopeFailure(scope, parsed.parts, field, action)
  if (scoped !== undefined) return { kind: 'refused', failure: scoped }
  if (String(parsed.sequence) !== prefix.sequence)
    return refused('the sequence is not the one of the basis')
  if (parsed.sequence > BigInt(ledger.projection.sequence))
    return refused('beyond the published facts')
  const sequence = Number(parsed.sequence)
  counters.seeks += 1
  const stored = sequence === 0 ? ledger.origin : (records[sequence - 1]?.basis ?? null)
  if (stored === null) return { kind: 'missing', sequence }
  if (!sameEvidence(stored, prefix.basis)) return refused('not the basis of this prefix')
  return { kind: 'resolved', sequence }
}

export function digestOf(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 24)
}

export function cursorOf(
  scope: AdmissionScope,
  origin: DurableEvidence | null,
  from: number,
  through: number,
  at: number,
): ReplyAdmissionPageCursor {
  const tenant = digestOf(scope.parts[0] ?? '')
  const bound = digestOf(JSON.stringify([scope.parts, origin?.digest ?? null]))
  const decoded = decodeReplyAdmissionPageCursor(
    `${CURSOR}${tenant}.${bound}.${from}.${through}.${at}`,
  )
  if ('failure' in decoded) throw new Error('memory Journal minted an invalid cursor')
  return decoded.ok
}

export function cursorPosition(
  scope: AdmissionScope,
  origin: DurableEvidence | null,
  cursor: string,
  from: number,
  through: number,
  action: string,
): Outcome<number, Failure> {
  const refused = (reason: string) => fail<Failure>({ kind: 'invalid', field: 'after', reason })
  const fields = cursor.startsWith(CURSOR) ? cursor.slice(CURSOR.length).split('.') : []
  if (fields.length !== 5) return refused('not a cursor of this Journal')
  const [tenant, bound, start, end, at] = fields
  if (tenant !== digestOf(scope.parts[0] ?? '')) return fail({ kind: 'denied', action })
  if (bound !== digestOf(JSON.stringify([scope.parts, origin?.digest ?? null])))
    return refused('another execution or execution origin')
  if (start !== String(from)) return refused('another lower bound')
  if (end !== String(through)) return refused('another range')
  const position = Number(at)
  if (!/^[1-9][0-9]*$/u.test(at ?? '') || !Number.isSafeInteger(position))
    return refused('not a position')
  if (position <= from || position >= through) return refused('outside the range')
  return succeed(position)
}

export function resolveThrough(
  scope: AdmissionScope,
  ledger: AdmissionLedger,
  through: DurableEvidence,
  action: string,
): Outcome<number, Failure> | Readonly<{ gap: ReplyAdmissionGapReason }> {
  const refused = fail<Failure>({ kind: 'invalid', field: 'through', reason: 'not a range' })
  if (through.owner !== scope.owner) return refused
  const parsed = parseRecord(through.record, RANGE)
  if (parsed === undefined) return refused
  const scoped = scopeFailure(scope, parsed.parts, 'through', action)
  if (scoped !== undefined) return fail(scoped)
  if (parsed.sequence > BigInt(ledger.projection.sequence)) return refused
  const sequence = Number(parsed.sequence)
  if (!sameEvidence(through, scope.mint(recordOf(scope, RANGE, sequence), sequence))) return refused
  if (sequence < ledger.rangesFrom) return { gap: 'range-unavailable' }
  return succeed(sequence)
}

export type AdmissionReadRequest = Readonly<{
  from: ReplyAdmissionFrom
  through: DurableEvidence
  after: ReplyAdmissionPageCursor | null
  limit: number
}>

export function readAdmissionPage(
  scope: AdmissionScope,
  records: readonly (AdmissionRecord | undefined)[],
  ledger: AdmissionLedger,
  request: AdmissionReadRequest,
  limits: AdmissionPageLimits,
  revision: number,
  action: string,
  counters: AdmissionCounters,
): Outcome<ReplyAdmissionPage, Failure> {
  const gap = (reason: ReplyAdmissionGapReason) =>
    succeed<ReplyAdmissionPage>({
      kind: 'gap',
      reason,
      recovery: scope.mint(`${JSON.stringify(scope.parts)}/reply-admission-recovery`, revision),
    })
  if (!Number.isSafeInteger(request.limit) || request.limit < 1)
    return fail({ kind: 'invalid', field: 'limit', reason: 'not a positive integer' })
  const through = resolveThrough(scope, ledger, request.through, action)
  if ('gap' in through) return gap(through.gap)
  if ('failure' in through) return through
  const target = through.ok
  let from: number
  if (request.from.kind === 'origin') {
    if (ledger.origin === null)
      return fail({
        kind: 'unavailable',
        owner: scope.owner,
        diagnostic: 'no trusted origin of the reply admission facts',
      })
    from = 0
  } else {
    const resolved = resolvePrefix(
      scope,
      records,
      ledger,
      request.from.prefix,
      'from',
      action,
      counters,
    )
    if (resolved.kind === 'refused') return fail(resolved.failure)
    if (resolved.kind === 'missing') return gap('missing-basis')
    from = resolved.sequence
  }
  if (from > target)
    return fail({ kind: 'invalid', field: 'from', reason: 'after the end of the range' })
  let start = from
  if (request.after !== null) {
    const position = cursorPosition(scope, ledger.origin, request.after, from, target, action)
    if ('failure' in position) return position
    start = position.ok
  }
  const startBasis = start === 0 ? ledger.origin : (records[start - 1]?.basis ?? null)
  if (startBasis === null) return gap('missing-basis')
  const startPrefix = { sequence: sequenceText(start), basis: startBasis }
  counters.pages += 1
  if (start === target)
    return succeed({
      kind: 'page',
      through: request.through,
      start: startPrefix,
      end: startPrefix,
      items: [],
      tail: { kind: 'complete' },
    })
  if (start + 1 < ledger.retainedFrom) return gap('retention')
  const count = Math.min(request.limit, limits.items ?? request.limit, target - start)
  const items: ReplyAdmissionItem[] = []
  let bytes = 0
  const bases: (DurableEvidence | null)[] = []
  for (const [offset, row] of rowsOf(records, start, count, counters).entries()) {
    if (row === undefined || !row.present) {
      if (items.length === 0) return gap('missing-fact')
      break
    }
    const size = canonical(row.fact).length
    if (limits.bytes !== null && items.length > 0 && bytes + size > limits.bytes) break
    bytes += size
    counters.decoded += 1
    items.push({
      sequence: sequenceText(start + offset + 1),
      fact: row.fact,
      publication: row.publication,
    })
    bases.push(row.basis)
  }
  while (items.length > 0 && bases.at(-1) === null) {
    items.pop()
    bases.pop()
  }
  if (items.length === 0) return gap('missing-basis')
  const last = items.at(-1)!
  const end: ReplyAdmissionPrefix = { sequence: last.sequence, basis: bases.at(-1)! }
  const reached = start + items.length
  return succeed({
    kind: 'page',
    through: request.through,
    start: startPrefix,
    end,
    items,
    tail:
      reached === target
        ? { kind: 'complete' }
        : { kind: 'more', next: cursorOf(scope, ledger.origin, from, target, reached) },
  })
}

export function checkReadPosition(
  scope: AdmissionScope,
  records: readonly (AdmissionRecord | undefined)[],
  ledger: AdmissionLedger,
  saved: ReplyAdmissionRead,
  next: ReplyAdmissionRead,
  action: string,
  counters: AdmissionCounters,
): Failure | undefined {
  const field = 'checkpoint.replyAdmissionRead'
  if (canonical(saved) === canonical(next)) return undefined
  if (next.kind !== 'verified')
    return { kind: 'invalid', field, reason: 'a verified read position does not go back' }
  const resolved = resolvePrefix(scope, records, ledger, next.prefix, field, action, counters)
  if (resolved.kind === 'refused') return resolved.failure
  if (resolved.kind === 'missing')
    return {
      kind: 'unavailable',
      owner: scope.owner,
      diagnostic: `missing-basis: the basis of the prefix ${resolved.sequence} cannot be resolved`,
    }
  if (saved.kind === 'verified' && BigInt(next.prefix.sequence) < BigInt(saved.prefix.sequence))
    return { kind: 'invalid', field, reason: 'the read position goes back' }
  return undefined
}

export function damagedLedger(
  records: readonly (AdmissionRecord | undefined)[],
  ledger: AdmissionLedger,
  damage: AdmissionDamage,
): Readonly<{ records: (AdmissionRecord | undefined)[]; ledger: AdmissionLedger }> | undefined {
  const next = [...records]
  switch (damage.kind) {
    case 'missing-fact':
    case 'missing-basis': {
      if (damage.kind === 'missing-basis' && damage.sequence === 0)
        return { records: next, ledger: { ...ledger, origin: null } }
      const row = next[damage.sequence - 1]
      if (row === undefined) return undefined
      next[damage.sequence - 1] =
        damage.kind === 'missing-fact' ? { ...row, present: false } : { ...row, basis: null }
      return { records: next, ledger }
    }
    case 'retention':
      return { records: next, ledger: { ...ledger, retainedFrom: damage.from } }
    case 'range-unavailable':
      return { records: next, ledger: { ...ledger, rangesFrom: damage.below } }
    default: {
      const _exhaustive: never = damage
      return _exhaustive
    }
  }
}

type Rows = readonly (AdmissionRecord | undefined)[]

// Admission records as a read sees them: a hole is answered by the closed admission at that
// sequence; the holes the table lacks are named together by settle, which throws NeedItems.
export function admissionRows(
  table: ClosedTable,
  execution: AgentExecutionId,
  records: Rows,
): Readonly<{ rows: Rows; settle(): void }> {
  const missing: ItemRef[] = []
  const closedAt = (index: number): AdmissionRecord | undefined => {
    const ref = { execution, family: 'admission', item: String(index + 1) }
    const text = itemText(ref)
    if (table.closed.has(text)) {
      const body = table.closed.get(text)
      return body === null || body === undefined
        ? undefined
        : admissionRecord(body as AdmissionView)
    }
    if (!table.closedComplete) missing.push(ref)
    return undefined
  }
  const rows = new Proxy(records, {
    get(target, key, receiver) {
      if (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(key))
        return Reflect.get(target, key, receiver) as unknown
      const index = Number(key)
      if (index >= target.length) return undefined
      return target[index] ?? closedAt(index)
    },
  })
  return {
    rows,
    settle() {
      if (missing.length > 0) throw new NeedItems(missing)
    },
  }
}

// Runs a read over the admission records, holes answered by the closed admissions.
export function readingAdmissions<T>(
  table: ClosedTable,
  execution: Readonly<{ id: AgentExecutionId; admissions: Rows }>,
  read: (rows: Rows) => T,
): T {
  const admitted = admissionRows(table, execution.id, execution.admissions)
  const answer = read(admitted.rows)
  admitted.settle()
  return answer
}

export function knownAdmission(rows: Rows, fact: ModelReplyAdmission): AdmissionRecord | undefined {
  const key = admissionKey(fact)
  return rows.find(record => record !== undefined && admissionKey(record.fact) === key)
}

export function checkedReadPosition(
  table: ClosedTable,
  execution: Readonly<{
    id: AgentExecutionId
    admissions: Rows
    admissionLedger: AdmissionLedger
    checkpoint: Readonly<{ replyAdmissionRead: ReplyAdmissionRead }>
  }>,
  scope: AdmissionScope,
  read: Readonly<{ next: ReplyAdmissionRead; counters: AdmissionCounters }>,
): Failure | undefined {
  return readingAdmissions(table, execution, rows =>
    checkReadPosition(
      scope,
      rows,
      execution.admissionLedger,
      execution.checkpoint.replyAdmissionRead,
      read.next,
      'commit',
      read.counters,
    ),
  )
}
