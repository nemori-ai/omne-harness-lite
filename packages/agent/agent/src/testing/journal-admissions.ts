// The reply admission ledger of the memory Journal (Agent SPEC "回复准入的已核实前缀"): the dense
// facts of one execution, the basis of each prefix, the projection the original Ja maintains
// incrementally, and the read of one fixed range `(from, through]` page by page. Every read goes
// through `rowsOf`, which counts each row it touches, so the complexity tests count what a read
// really scans. The session-adapters Journal keeps its own copy of this ledger.
import {
  decodeReplyAdmissionPageCursor,
  decodeReplyAdmissionSequence,
  type Adoption,
  type DurableEvidence,
  type Failure,
  type ModelReplyAdmission,
  type ReplyAdmissionFrom,
  type ReplyAdmissionGapReason,
  type ReplyAdmissionItem,
  type ReplyAdmissionPage,
  type ReplyAdmissionPageCursor,
  type ReplyAdmissionPrefix,
  type ReplyAdmissionProjection,
  type ReplyAdmissionRead,
  type ReplyAdmissionSequence,
} from '@omne-harness/agent-contract'
import { createHash } from 'node:crypto'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { canonical } from '../canonical.ts'

/** One reply admission fact as the Journal keeps it, at index `sequence - 1`. */
export type AdmissionRecord = Readonly<{
  fact: ModelReplyAdmission
  /** The receipt evidence of the original Ja that published the fact. */
  publication: DurableEvidence
  /** The basis of the prefix that ends with this fact; null when a test removed it. */
  basis: DurableEvidence | null
  /** False when a test removed the fact itself. */
  present: boolean
}>

/** The projection the original Ja maintains: the counts under `rule` and the end prefix. */
export type AdmissionProjection = Readonly<{
  rule: Adoption
  consecutive: number
  total: number
  last: DurableEvidence | null
  sequence: number
  basis: DurableEvidence
}>

/** The per-execution state of the ledger besides the facts. A write replaces it whole. */
export type AdmissionLedger = Readonly<{
  /** The basis of the zero prefix, formed by the original open; null when a test removed it. */
  origin: DurableEvidence | null
  /** The first sequence whose fact is still kept; 1 keeps every fact. */
  retainedFrom: number
  /** The smallest `through` sequence that still resolves; 0 resolves every range. */
  rangesFrom: number
  projection: AdmissionProjection
}>

/**
 * Where a ledger belongs: `parts` are the tenant text first, then the scope texts of the provider,
 * then the execution. Every basis, range and cursor the ledger mints names them.
 */
export type AdmissionScope = Readonly<{
  parts: readonly string[]
  owner: string
  mint(record: string, revision: number): DurableEvidence
}>

/** What the reads of one Journal did, for the complexity tests (Agent SPEC D5 第 8 节). */
export type AdmissionCounters = {
  /** Range positions: one per page that reads at least one row. */
  seeks: number
  /** Rows a read touched, including rows it then skipped. */
  scanned: number
  /** Facts a read decoded into a page. */
  decoded: number
  pages: number
  /** Facts a projection rebuild folded. */
  folds: number
  loads: number
  /** Commits that wrote a checkpoint. */
  checkpointWrites: number
}

export function admissionCounters(): AdmissionCounters {
  return { seeks: 0, scanned: 0, decoded: 0, pages: 0, folds: 0, loads: 0, checkpointWrites: 0 }
}

/** A test removal of ledger material, as a storage fault or an operator error would leave it. */
export type AdmissionDamage =
  | Readonly<{ kind: 'missing-fact'; sequence: number }>
  | Readonly<{ kind: 'missing-basis'; sequence: number }>
  | Readonly<{ kind: 'retention'; from: number }>
  | Readonly<{ kind: 'range-unavailable'; below: number }>

/** How the provider limits one page by itself, besides the caller's `limit`. */
export type AdmissionPageLimits = Readonly<{ items: number | null; bytes: number | null }>

const PREFIX = 'reply-admission-prefix'
const RANGE = 'reply-admissions'
const CURSOR = 'rac1.'

function sequenceText(value: number): ReplyAdmissionSequence {
  const decoded = decodeReplyAdmissionSequence(String(value))
  if ('failure' in decoded) throw new Error(`memory Journal minted an invalid sequence: ${value}`)
  return decoded.ok
}

function sameEvidence(left: DurableEvidence, right: DurableEvidence): boolean {
  return canonical(left) === canonical(right)
}

/** The record text of a basis or range: the scope parts, the kind and the sequence. */
function recordOf(scope: AdmissionScope, kind: string, sequence: number): string {
  return `${JSON.stringify(scope.parts)}/${kind}/${sequence}`
}

/** The scope parts and the sequence a record text names, or undefined when it is not one. */
function parseRecord(
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

/** Another tenant is `denied`, any other scope `invalid` (Agent SPEC "判定次序与失败映射" 1). */
function scopeFailure(
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

/** The ledger of a new execution: the zero prefix formed by the original open at `revision`. */
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

/** The projection after one more fact: the incremental step of the original Ja. */
function stepProjection(
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

/**
 * The record and the next ledger of one new fact, published by the Ja at `revision` with the
 * receipt evidence `publication`. The caller writes both in the same write as the Ja.
 */
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

/** The key of the deduplication of SPEC:598: the original call and result version. */
export function admissionKey(fact: ModelReplyAdmission): string {
  return JSON.stringify([fact.call, fact.resultVersion])
}

/** The fixed range of the current facts, as `load` names it. */
export function throughOf(scope: AdmissionScope, ledger: AdmissionLedger): DurableEvidence {
  const sequence = ledger.projection.sequence
  return scope.mint(recordOf(scope, RANGE, sequence), sequence)
}

/** The projection `load` returns, or a failure when the rule changed without a conversion. */
export function projectionOf(
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

/** Every row from index `start`, `count` rows; each row touched is counted. */
function rowsOf(
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

/**
 * The projection of every fact under `rule`, folded from the origin: the cold path of a rule
 * change (Agent SPEC D5 第 4 节). Undefined when a fact is missing: there is no trusted start.
 */
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

/** The resolution of a basis: its sequence, a refusal, or material the Journal lost. */
type Resolved =
  | Readonly<{ kind: 'resolved'; sequence: number }>
  | Readonly<{ kind: 'refused'; failure: Failure }>
  | Readonly<{ kind: 'missing'; sequence: number }>

/**
 * Resolves `prefix` by a point read of its basis: another tenant is `denied`, another execution,
 * an unknown or forged basis, or a sequence that does not match is `invalid`, a lawful basis whose
 * material the Journal lost is `missing`.
 */
function resolvePrefix(
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

/** A short digest of a text, so that a cursor stays within the identity length. */
function digestOf(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 24)
}

/**
 * The cursor of the next page: digests of the tenant and of the full scope with the execution
 * origin, the lower bound, the range and the end of the page before. It carries no grant.
 */
function cursorOf(
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

/** The end of the page before that a cursor names, after checking it against the request. */
function cursorPosition(
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

/** The fixed range a `through` names, a refusal, or the gap of a range no longer resolvable. */
function resolveThrough(
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

export type ReadRequest = Readonly<{
  from: ReplyAdmissionFrom
  through: DurableEvidence
  after: ReplyAdmissionPageCursor | null
  limit: number
}>

/**
 * One page of the fixed range `(from, through]` (Agent SPEC "回复准入的已核实前缀", 3.3): at most
 * `limit` facts and at most the provider's own item and byte limits, at least one fact unless the
 * range is complete, a gap for a missing fact, a missing basis, retention or a range that no
 * longer resolves.
 */
export function readAdmissionPage(
  scope: AdmissionScope,
  records: readonly (AdmissionRecord | undefined)[],
  ledger: AdmissionLedger,
  request: ReadRequest,
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
  let end = startPrefix
  for (const [offset, row] of rowsOf(records, start, count, counters).entries()) {
    if (row === undefined || !row.present) {
      if (items.length === 0) return gap('missing-fact')
      break
    }
    if (row.basis === null) {
      if (items.length === 0) return gap('missing-basis')
      break
    }
    const size = canonical(row.fact).length
    // A fact larger than the provider's byte limit still gets a page of its own.
    if (limits.bytes !== null && items.length > 0 && bytes + size > limits.bytes) break
    bytes += size
    counters.decoded += 1
    const sequence = sequenceText(start + offset + 1)
    items.push({ sequence, fact: row.fact, publication: row.publication })
    end = { sequence, basis: row.basis }
  }
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

/**
 * The commit-time check of a checkpoint's read position (Agent SPEC D5 5.1, 预防): when it changes,
 * the new value is verified, its basis resolves to this execution, it does not pass the published
 * facts and it does not go back. Another tenant's basis is `denied`; a lawful basis whose material
 * the Journal lost is `unavailable` with the diagnostic `missing-basis`. A point read; no scan.
 */
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

/** The records and ledger after `damage`; the records are replaced, never changed in place. */
export function damaged(
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
