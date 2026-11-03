// AD-04, the Request Context history source of Session (SPEC AD-04): two sub-plugins and the
// session-side parts of K-RQ.
//
// - The source sub-plugin `session-ad04` injects `session` with the `reader` caller class and
//   provides `contextHolderSources` (K-RQ). It lends four parts: the history source (`read`,
//   `compactionContext`), the narrow adoption source, the read eligibility bridge and the history
//   evidence resolver. Every Session call of a part carries the access of that call; the plugin has
//   no principal of its own.
// - The lower bound sub-plugin `session-ad04-lower-bound` injects `session` with the `coordinator`
//   caller class. It reads `readWork` with the access of the call: the open work that bounds the
//   compaction window from below, and the context scopes of the session.
//
// A lease is an effect of the borrower fiber. The holder pulls the settlement when the lease ends,
// by `release` or by that unload, and closes the lent reads only after every settlement it pulled
// has ended (RQ-12). After the reads have closed, every part answers unavailable.
//
// The Session log is the authority. The plugins keep only derivatives: the scope-to-session index
// (process lifetime, bounded) and the lease bookkeeping of one source fiber. Named gap: the
// decoding of a history head evidence to its session is handed in as `heads`.
//
// The narrow adoption source reads the `a` part of the session (FIXED-FACTS F5): the request the
// last main-purpose M0 recorded, through `sessionAdoptedRequests` of the session-log Journal
// provider, taken per call. It decodes the fixed request record of request-context-contract and
// checks it against the target and the coverage evidence of the same M0.
import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { parseRecordEntryRef, type CompactionContext } from '@omne-harness/message'
import { resolveModelInvocationRef } from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'
import {
  decodeCommitOrder,
  decodeEpochId,
  decodeFixedRequestRecord,
  decodeGroupToken,
  decodeHistorySequence,
  type Access,
  type AdoptedRead,
  type AdoptedRequestFact,
  type AdoptedRequestSource,
  type CompactionContextResult,
  type ContextReadEligibility,
  type ContextTarget,
  type Coverage,
  type DurableEvidence,
  type EpochId,
  type GroupToken,
  type HistoryCursor,
  type HistoryEvidence,
  type HistoryEvidenceResolver,
  type HistoryReadResult,
  type HistoryRow,
  type HistorySequence,
  type HistorySource,
  type HistoryUpper,
  type InvalidReason,
  type SourceRead,
  type SourceSettlement,
} from '@omne-harness/request-context-contract'
import type {
  ContextHolderLeaseResult,
  ContextHolderParts,
  LeaseSettlement,
} from '@omne-harness/request-context-cordis-contract'
import { ContextHolderSourcesService } from '@omne-harness/request-context-cordis-contract/cordis'
import { decodeScopeRef, type ScopeRef } from '@omne-harness/runtime-context-contract'
import type {
  HistoryEntry,
  HistoryPage,
  ModelViewBasis,
  ModelViewRead,
  ModelViewRow,
  SessionAccess,
  SessionFailure,
  SessionId,
  WorkSnapshot,
} from '@omne-harness/session-contract'
import type {
  SessionAdoptedRequest,
  SessionAdoptedRequestRead,
  SessionAdoptedRequests,
} from '@omne-harness/session-cordis-contract'
import { sessionAdoptedRequestsKey, sessionKey } from '@omne-harness/session-cordis-contract/cordis'
import { canonical } from '../testing/canonical.ts'
import { compactionReads } from '../testing/session-values.ts'

const LOGGER = 'session-adapters/history-source'
/** The initial bound of the scope-to-session index; the assembly may set another (IC-14). */
const SCOPE_INDEX_ENTRIES = 4096
/** The initial page size of the full history read of a compaction window (IC-14). */
const PAGE_BYTES = 65536
/** A history read that has not ended after this many pages is not a complete read. */
const MAX_PAGES = 10000
/** The most sessions whose model view cursors one source fiber keeps; the oldest goes first. */
const CURSOR_SESSIONS = 1024
/**
 * The most model view cursors kept per session; the one after the lowest row goes first, except
 * the one just issued. A read never depends on a kept cursor to move on: it carries the cursor of
 * its own last page.
 */
const CURSORS_PER_SESSION = 16
/** The most row sizes kept per session; the lowest rows go first. */
const SIZES_PER_SESSION = 65536

/** The session that one durable history head names. */
export type SessionHistoryHead = Readonly<{ tenant: TenantId; session: SessionId }>

/**
 * Decodes the durable evidence of a history head (the `history` evidence of an Agent execution
 * snapshot) to the session it names. `null` is evidence this decoder does not know. The decoder
 * checks nothing: the resolver checks the tenant and the access of every call.
 */
export interface SessionHistoryHeads {
  sessionOf(evidence: DurableEvidence): SessionHistoryHead | null
}

/** What the assembly hands to AD-04. */
export type SessionHistorySourceInput = Readonly<{
  heads: SessionHistoryHeads
  /** The most scopes the scope-to-session index keeps; the oldest goes first. */
  scopeIndexEntries?: number
  /** The page size of the full history read of a compaction window. */
  pageBytes?: number
}>

/** The authority the narrow adoption source names: the `a` part of the session log. */
const ADOPTED_AUTHORITY: AdoptedRequestSource<unknown>['authority'] = {
  owner: '@omne-harness/session-adapters',
  name: 'session-ad04/adopted',
  revision: '1',
  digest: 'session-ad04:adopted',
}

/**
 * The digest that agent-context mints for the coverage evidence of a preparation: SHA-256 of the
 * canonical text of the `Coverage`, base64url (agent-context SPEC, record evidence table).
 */
function coverageDigest(coverage: Coverage): string {
  return createHash('sha256').update(canonical(coverage)).digest('base64url')
}

/** The `readWork` of the lower bound sub-plugin, as the source sub-plugin sees it. */
interface WorkReads {
  readWork(access: SessionAccess<unknown>): Promise<Outcome<WorkSnapshot, SessionFailure>>
}

type Shared = {
  readonly input: SessionHistorySourceInput
  /** tenant text and scope ref → the session; a derivative of `readWork`, kept across generations. */
  readonly index: Map<string, SessionHistoryHead>
  readonly link: { work: WorkReads | undefined }
  /** One number per source fiber in this process; the eligibility revision carries it. */
  generations: number
  /** The reads state of the latest source fiber; `undefined` before the first one. */
  latest: { closed: boolean } | undefined
}

type Unavailable = Readonly<{ kind: 'unavailable'; diagnostic: string }>
type Invalid = Readonly<{ kind: 'invalid'; field: string; reason: InvalidReason }>
type Denied = Readonly<{ kind: 'denied' }>
type Refusal = Unavailable | Invalid | Denied | Readonly<{ kind: 'unknown' }>

const DENIED: Denied = { kind: 'denied' }
const unavailable = (diagnostic: string): Unavailable => ({ kind: 'unavailable', diagnostic })
const invalid = (field: string, reason: InvalidReason): Invalid => ({
  kind: 'invalid',
  field,
  reason,
})

function describe(cause: unknown): string {
  try {
    return cause instanceof Error ? cause.message : String(cause)
  } catch {
    return 'a thrown value that has no text'
  }
}

function tenantText(tenant: unknown): string | undefined {
  try {
    const encoded = tenantCodec.encode(tenant as TenantId)
    return encoded.ok ? encoded.value : undefined
  } catch {
    return undefined
  }
}

function indexKey(tenant: string, scope: ScopeRef): string {
  return `${tenant}\u0000${scope.ref}`
}

// --- translation between the Session model view and the Request Context history evidence ----------

const EPOCH_ESCAPE = /%([0-9a-f]{2})/gu

/**
 * The Session epoch text as an `EpochId`. The Session text may hold control characters, which an
 * `EpochId` refuses; they, the space, DEL and `%` are written as `%xx`, so the mapping is reversible.
 */
function epochOf(text: string): EpochId | undefined {
  let escaped = ''
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0
    escaped +=
      code <= 0x20 || code === 0x7f || character === '%'
        ? `%${code.toString(16).padStart(2, '0')}`
        : character
  }
  const decoded = decodeEpochId(escaped)
  return 'ok' in decoded ? decoded.ok : undefined
}

function sessionEpochOf(epoch: EpochId): string {
  return epoch.replace(EPOCH_ESCAPE, (_, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  )
}

// The two sequences of one epoch view. The Session model view numbers its rows from 1 and names
// the empty view by the upper bound "0"; a Request Context history numbers the rows of an epoch
// from 0 (request-context-contract SPEC, "历史源读口与 epoch 视图"). Row n of Session is row n - 1
// of the history; a Session cursor after row n is a history cursor after row n - 1.

/** The history sequence of the Session row `seq`; undefined for "0" or a non-canonical text. */
function historySeqOf(seq: string): HistorySequence | undefined {
  const decoded = decodeHistorySequence(seq)
  if (!('ok' in decoded) || decoded.ok === '0') return undefined
  const shifted = decodeHistorySequence(String(BigInt(decoded.ok) - 1n))
  return 'ok' in shifted ? shifted.ok : undefined
}

/** The Session row of the history sequence `seq`, a canonical decimal checked before. */
function sessionSeqOf(seq: HistorySequence): string {
  return String(BigInt(seq) + 1n)
}

/** The Session row number of a model view row: a canonical decimal from 1. */
function sessionRowOf(seq: string): bigint | undefined {
  return historySeqOf(seq) === undefined ? undefined : BigInt(seq)
}

/** `"0"` is the empty history; any other canonical decimal is the entry of its last row. */
function upperOf(text: string): HistoryUpper | undefined {
  if (text === '0') return { kind: 'empty' }
  const seq = historySeqOf(text)
  return seq === undefined ? undefined : { kind: 'entry', seq }
}

function basisOf(evidence: HistoryEvidence): ModelViewBasis {
  return {
    epoch: sessionEpochOf(evidence.epoch),
    upper: evidence.upper.kind === 'empty' ? '0' : sessionSeqOf(evidence.upper.seq),
  }
}

function evidenceOf(target: ContextTarget, basis: ModelViewBasis): HistoryEvidence | undefined {
  const epoch = epochOf(basis.epoch)
  const upper = upperOf(basis.upper)
  return epoch === undefined || upper === undefined ? undefined : { target, epoch, upper }
}

function rowOf(row: ModelViewRow): HistoryRow | undefined {
  const seq = historySeqOf(row.seq)
  const entry = parseRecordEntryRef(row.entry)
  if (seq === undefined || entry === null || !Number.isSafeInteger(row.bytes) || row.bytes < 0)
    return undefined
  // No model view row carries its original Model call, so no row has `sourceCall` (SPEC AD-04 3).
  return {
    seq,
    entry,
    bytes: String(row.bytes),
    prefixDigest: row.prefixDigest,
    message: row.message,
  } as HistoryRow
}

function sameEvidence(left: HistoryEvidence, right: HistoryEvidence): boolean {
  return (
    tenantText(left.target.tenant) === tenantText(right.target.tenant) &&
    left.target.scope.ref === right.target.scope.ref &&
    left.epoch === right.epoch &&
    left.upper.kind === right.upper.kind &&
    (left.upper.kind === 'empty' ||
      (right.upper.kind === 'entry' && left.upper.seq === right.upper.seq))
  )
}

/** Whether a history cursor is well formed and was issued under the same evidence. */
function cursorFollows(cursor: HistoryCursor, evidence: HistoryEvidence): boolean {
  return (
    typeof cursor === 'object' &&
    typeof cursor.after === 'string' &&
    'ok' in decodeHistorySequence(cursor.after) &&
    typeof cursor.evidence === 'object' &&
    cursor.evidence !== null &&
    checkEvidence(cursor.evidence).kind !== 'invalid' &&
    sameEvidence(cursor.evidence, evidence)
  )
}

/** A Session read refusal as the refusal of a part. Session reads have no unknown. */
function refusalOf(failure: SessionFailure, field: string): Refusal {
  switch (failure.kind) {
    case 'denied':
      return DENIED
    case 'invalid':
      return invalid(field, 'cursor-invalidated')
    case 'unavailable':
      return unavailable(`session ${failure.owner}: ${failure.diagnostic}`)
    case 'quarantined':
      return unavailable(`session quarantined: ${failure.diagnostic}`)
    default:
      return unavailable(`the session read answered ${failure.kind}`)
  }
}

// --- the cursors Session issued -------------------------------------------------------------------

/** One model view page as the reader needs it: the rows after the cursor, and whether more follow. */
type ViewRead =
  | Readonly<{ kind: 'page'; rows: readonly ModelViewRow[]; more: boolean }>
  | Readonly<{ kind: 'epoch-changed'; current: ModelViewBasis }>

/**
 * What one session's model view reads have learned under one epoch: the opaque cursor Session
 * issued after a row, and the size of each row seen. A derivative of the reads, lost with the
 * fiber; rows of an epoch never change, so neither does a kept cursor's position or a kept size.
 */
class CursorBook {
  readonly key: string
  readonly epoch: string
  readonly tokens = new Map<bigint, string>()
  private readonly sizes = new Map<bigint, number>()

  constructor(key: string, epoch: string) {
    this.key = key
    this.epoch = epoch
  }

  /** Where a read for the rows after `after` starts: the nearest kept cursor at or before it. */
  reach(after: bigint): Reach {
    let best = 0n
    for (const row of this.tokens.keys()) if (row <= after && row > best) best = row
    return { position: best, token: best === 0n ? null : (this.tokens.get(best) ?? null) }
  }

  /** The bytes of the rows `from + 1` to `to`, or undefined when the size of one is not known. */
  span(from: bigint, to: bigint): number | undefined {
    let total = 0
    for (let row = from + 1n; row <= to; row++) {
      const size = this.sizes.get(row)
      if (size === undefined) return undefined
      total += size
    }
    return Math.max(1, total)
  }

  size(row: bigint, bytes: number): void {
    this.sizes.set(row, bytes)
    while (this.sizes.size > SIZES_PER_SESSION) dropLowest(this.sizes)
  }

  /** Keeps a cursor Session issued after `row`; the cursor just issued is never the one dropped. */
  remember(row: bigint, token: string): void {
    this.tokens.set(row, token)
    while (this.tokens.size > CURSORS_PER_SESSION) dropLowest(this.tokens, row)
  }
}

/** Drops the lowest row of `map`, except `keep`. */
function dropLowest(map: Map<bigint, unknown>, keep?: bigint): void {
  let lowest: bigint | undefined
  for (const row of map.keys())
    if (row !== keep && (lowest === undefined || row < lowest)) lowest = row
  if (lowest !== undefined) map.delete(lowest)
}

/**
 * Where a read of the model view stands: the Session row it has reached and the cursor Session
 * issued after it (`null` at the start of the epoch, which needs none).
 */
type Reach = Readonly<{ position: bigint; token: string | null }>

/** The bytes of the rows a read from `position` skips to reach `after`; the page limit if unknown. */
function skippedBytes(book: CursorBook, position: bigint, after: bigint): number {
  return position === after ? 0 : (book.span(position, after) ?? PAGE_BYTES)
}

/** A cursor that Session refuses on a first attempt: the book is forgotten and the read starts over. */
function staleCursor(token: string | null, failure: SessionFailure, retried: boolean): boolean {
  return token !== null && failure.kind === 'invalid' && !retried
}

/** The refusal of a read whose budget or cursor is not usable under `evidence`, if there is one. */
function readRefusal(
  budgetBytes: number,
  cursor: HistoryCursor | null,
  evidence: HistoryEvidence,
): Invalid | undefined {
  if (!Number.isSafeInteger(budgetBytes) || budgetBytes < 1)
    return invalid('budgetBytes', 'missing-input')
  if (cursor !== null && !cursorFollows(cursor, evidence))
    return invalid('cursor', 'cursor-invalidated')
  return undefined
}

/** The page of the rows of `kept` that fit `budget` (at least one), and whether more follow. */
function pageWithin(kept: readonly ModelViewRow[], budget: number, next: boolean): ViewRead {
  const taken: ModelViewRow[] = []
  let bytes = 0
  for (const row of kept) {
    if (taken.length > 0 && bytes + row.bytes > budget) break
    taken.push(row)
    bytes += row.bytes
  }
  return { kind: 'page', rows: taken, more: taken.length < kept.length || next }
}

// --- validation of the inputs of a part ----------------------------------------------------------

type Checked = Readonly<{ kind: 'checked'; tenant: string; access: Access<unknown> }>

/** The access of one call; a missing access or tenant is invalid, never a Session call. */
function checkAccess(access: unknown): Checked | Invalid {
  if (typeof access !== 'object' || access === null) return invalid('access', 'missing-access')
  const tenant = tenantText((access as Access<unknown>).tenant)
  if (tenant === undefined) return invalid('access', 'missing-access')
  return { kind: 'checked', tenant, access: access as Access<unknown> }
}

type Targeted = Checked & Readonly<{ target: ContextTarget }>

/** The access and the target of one call; another tenant's target is denied before any read. */
function checkTarget(access: unknown, target: unknown): Targeted | Invalid | Denied {
  const checked = checkAccess(access)
  if (checked.kind !== 'checked') return checked
  if (typeof target !== 'object' || target === null) return invalid('target', 'missing-scope')
  const { tenant, scope } = target as ContextTarget
  const text = tenantText(tenant)
  if (text === undefined) return invalid('target', 'missing-scope')
  if (typeof scope !== 'object' || scope === null || !('ok' in decodeScopeRef(scope)))
    return invalid('target', 'missing-scope')
  if (text !== checked.tenant) return DENIED
  return { ...checked, target: target as ContextTarget }
}

type Evidenced = Readonly<{ kind: 'evidence'; evidence: HistoryEvidence }>

/** A history evidence of the right shape; a malformed epoch or upper is invalid. */
function checkEvidence(evidence: unknown): Evidenced | Invalid {
  if (typeof evidence !== 'object' || evidence === null) return invalid('evidence', 'missing-input')
  const { epoch, upper } = evidence as HistoryEvidence
  if (typeof epoch !== 'string' || !('ok' in decodeEpochId(epoch)))
    return invalid('evidence', 'unknown-epoch')
  if (typeof upper !== 'object' || upper === null) return invalid('evidence', 'upper-out-of-range')
  if (
    upper.kind !== 'empty' &&
    (upper.kind !== 'entry' || !('ok' in decodeHistorySequence(upper.seq)))
  )
    return invalid('evidence', 'upper-out-of-range')
  return { kind: 'evidence', evidence: evidence as HistoryEvidence }
}

// --- the source sub-plugin -----------------------------------------------------------------------

type Located = Omit<Targeted, 'kind'> &
  Readonly<{ kind: 'located'; session: SessionAccess<unknown> }>

class SessionHolderSources extends ContextHolderSourcesService<unknown> {
  private readonly scope: Context
  private readonly shared: Shared
  private readonly state = { closing: false, closed: false }
  /** The settlements pulled and not yet finished; a finished one is reported and leaves the set. */
  private readonly pending = new Set<Promise<SourceSettlement>>()
  private readonly revision: GroupToken
  private readonly parts: ContextHolderParts<unknown>
  /** Per session, the model view cursors Session issued and the row sizes (`CursorBook`). */
  private readonly cursors = new Map<string, CursorBook>()

  constructor(scope: Context, shared: Shared) {
    super(scope)
    this.scope = scope
    this.shared = shared
    shared.generations += 1
    const token = decodeGroupToken(`session-ad04/${shared.generations}`)
    if (!('ok' in token)) throw new TypeError('the eligibility revision is not a group token')
    this.revision = token.ok
    shared.latest = this.state
    this.parts = this.partsOf()
    scope.effect(() => () => this.close(), 'contextHolderSources.close')
  }

  lease(input: Readonly<{ settle: LeaseSettlement }>): ContextHolderLeaseResult<unknown> {
    if (this.state.closing)
      return { kind: 'unavailable', diagnostic: 'the holder is closing its reads' }
    const settled = Promise.withResolvers<SourceSettlement>()
    let ended = false
    const end = () => {
      if (ended) return
      ended = true
      let pulled: Promise<SourceSettlement>
      try {
        pulled = input.settle()
      } catch (cause) {
        pulled = Promise.reject(cause)
      }
      pulled.then(settled.resolve, settled.reject)
    }
    // `this.ctx` is the borrower's context: its unload ends the lease like `release` (IC-13).
    const remove = this.ctx.effect(() => end, 'contextHolderSources.lease')
    const promise = settled.promise
    this.pending.add(promise)
    promise.then(
      value => {
        this.pending.delete(promise)
        this.report({ status: 'fulfilled', value })
      },
      (reason: unknown) => {
        this.pending.delete(promise)
        this.report({ status: 'rejected', reason })
      },
    )
    return {
      kind: 'leased',
      lease: {
        parts: this.parts,
        release() {
          end()
          void remove()
        },
      },
    }
  }

  /** Waits for every settlement it pulled, then closes the lent reads (RQ-12). */
  private async close(): Promise<void> {
    this.state.closing = true
    await Promise.allSettled(this.pending)
    this.state.closed = true
  }

  /** Reports a settlement that failed or left outstanding work; a clean one says nothing. */
  private report(result: PromiseSettledResult<SourceSettlement>): void {
    const logger = this.scope.logger(LOGGER)
    if (result.status === 'rejected')
      logger.warn(`a lease settlement failed: ${describe(result.reason)}`)
    else if (result.value.kind === 'unavailable')
      logger.warn(`a lease settled with outstanding work: ${result.value.outstanding.length}`)
  }

  /** One Session call; a throw or a stopped plugin is unavailable, never a success. */
  private async call<T>(
    read: () => Promise<Outcome<T, SessionFailure>>,
  ): Promise<Outcome<T, SessionFailure>> {
    if (this.state.closed)
      return {
        failure: { kind: 'unavailable', owner: 'session-ad04', diagnostic: 'the reads closed' },
      }
    try {
      return await read()
    } catch (cause) {
      return {
        failure: {
          kind: 'unavailable',
          owner: 'session-ad04',
          diagnostic: `the session read threw: ${describe(cause)}`,
        },
      }
    }
  }

  /** The session of a target, from the index that the resolver built from `readWork`. */
  private locate(access: unknown, target: unknown): Located | Invalid | Denied | Unavailable {
    if (this.state.closed) return unavailable('the reads closed')
    const targeted = checkTarget(access, target)
    if (targeted.kind !== 'checked') return targeted
    const bound = this.shared.index.get(indexKey(targeted.tenant, targeted.target.scope))
    if (bound === undefined)
      return unavailable('scope-unresolved: no history head of this scope was resolved here')
    return {
      tenant: targeted.tenant,
      access: targeted.access,
      target: targeted.target,
      kind: 'located',
      session: { ...targeted.access, session: bound.session },
    }
  }

  private defect(diagnostic: string): Unavailable {
    this.scope.logger(LOGGER).error(`translation defect: ${diagnostic}`)
    return unavailable(`translation defect: ${diagnostic}`)
  }

  /** The current read eligibility of the access on the session of the target. */
  private async admitted(
    access: unknown,
    target: unknown,
  ): Promise<Located | Invalid | Denied | Unavailable> {
    const located = this.locate(access, target)
    if (located.kind !== 'located') return located
    const probe = await this.call(() =>
      this.scope[sessionKey].history.readModelView({
        ...located.session,
        basis: null,
        after: null,
        pageBytes: 1,
      }),
    )
    if ('failure' in probe) {
      const refused = refusalOf(probe.failure, 'target')
      return refused.kind === 'unknown' || refused.kind === 'invalid'
        ? unavailable(`the eligibility read answered ${probe.failure.kind}`)
        : refused
    }
    return located
  }

  private partsOf(): ContextHolderParts<unknown> {
    const history: HistorySource<unknown> = {
      read: input => this.read(input),
      compactionContext: input => this.compactionContext(input),
    }
    const eligibility: ContextReadEligibility<unknown> = {
      check: async input => {
        const admitted = await this.admitted(input.access, input.target)
        if (admitted.kind === 'located') return { kind: 'allowed', revision: this.revision }
        return admitted.kind === 'invalid' ? DENIED : admitted
      },
    }
    const adopted: AdoptedRequestSource<unknown> = {
      authority: ADOPTED_AUTHORITY,
      readCount: input => this.adoptedCount(input),
      readSource: input => this.adoptedFact(input),
    }
    const resolveHistory: HistoryEvidenceResolver<unknown> = input => this.resolve(input)
    return { history, adopted, eligibility, resolveHistory }
  }

  /**
   * The current fixed adoption of a target (RQ-14): after the same check as `eligibility.check`,
   * the `a` part of the session of the target, through `sessionAdoptedRequests` with the access of
   * the call. The provider answers what it saved; this part decodes the fixed request record and
   * checks it against the target and the coverage evidence of the same M0.
   */
  private async adoptedFact(
    input: AdoptedRead<unknown>,
  ): Promise<SourceRead<AdoptedRequestFact | null>> {
    const admitted = await this.admitted(input.access, input.target)
    if (admitted.kind !== 'located') return admitted
    let requests: SessionAdoptedRequests<unknown> | undefined
    try {
      requests = this.scope.get(sessionAdoptedRequestsKey)
    } catch (cause) {
      return unavailable(`the adopted request reads are not readable: ${describe(cause)}`)
    }
    if (requests === undefined)
      return unavailable('adopted-requests-absent: sessionAdoptedRequests is not provided')
    let read: SessionAdoptedRequestRead
    try {
      read = await requests.readAdoptedRequest({
        access: admitted.access,
        session: admitted.session.session,
      })
    } catch (cause) {
      return unavailable(`the adopted request read threw: ${describe(cause)}`)
    }
    switch (read.kind) {
      case 'denied':
        return DENIED
      case 'unavailable':
        return unavailable(`adopted request: ${read.diagnostic}`)
      case 'value': {
        if (read.value === null) return { kind: 'value', value: null }
        const fact = this.factOf(admitted, read.value)
        return fact.kind === 'other-scope' ? this.notYetFixed(input) : fact
      }
      default:
        return this.defect('the adopted request read gave an answer of no known kind')
    }
  }

  /**
   * The answer when the last M0 of the session fixed a request of another scope than the target.
   * It is `null` only while the target is still the current scope of its session, read after the
   * `a` part was read: a new scope that has not fixed a request yet. A target scope that was
   * retired fixed a request that can no longer be read, and that is `unavailable`, never `null`
   * (RQ-14: unknown or unavailable is not null).
   */
  private async notYetFixed(input: AdoptedRead<unknown>): Promise<SourceRead<null>> {
    const admitted = await this.admitted(input.access, input.target)
    if (admitted.kind !== 'located') return admitted
    const work = this.shared.link.work
    if (work === undefined)
      return unavailable('the lower bound sub-plugin is not running: the current scope is unknown')
    const head = { tenant: admitted.target.tenant, session: admitted.session.session }
    const current = await this.currentScope(work, admitted.session, head, admitted.tenant)
    if (!('scope' in current))
      return current.kind === 'denied'
        ? current
        : unavailable(`the current scope is not readable: ${current.kind}`)
    return current.scope.ref === admitted.target.scope.ref
      ? { kind: 'value', value: null }
      : unavailable('the target scope was retired: the request it fixed is not readable')
  }

  /**
   * The `AdoptedRequestFact` of one saved request for the target of `located`, or `other-scope`
   * when the saved request was fixed for another scope of the session.
   */
  private factOf(
    located: Located,
    saved: SessionAdoptedRequest,
  ): SourceRead<AdoptedRequestFact> | Readonly<{ kind: 'other-scope' }> {
    const decoded = decodeFixedRequestRecord(saved.record)
    if ('failure' in decoded) return invalid('adopted', 'unsupported-format')
    const record = decoded.ok
    if (tenantText(record.target.tenant) !== located.tenant) return DENIED
    if (record.target.scope.ref !== located.target.scope.ref) return { kind: 'other-scope' }
    if (saved.coverage === null || coverageDigest(record.coverage) !== saved.coverage.digest)
      return invalid('adopted', 'source-evidence-conflict')
    const invocation = resolveModelInvocationRef(saved.reference, located.target.tenant)
    if ('failure' in invocation) return invalid('adopted', 'source-evidence-conflict')
    const order = decodeCommitOrder(saved.order)
    if ('failure' in order) return this.defect('the adoption order is not a commit order')
    return {
      kind: 'value',
      value: {
        coverage: record.coverage,
        target: located.target,
        call: { tenant: located.target.tenant, call: invocation.ok.call },
        candidate: record.candidate,
        order: order.ok,
        committed: saved.fixed,
        windowTokens: record.windowTokens,
        accounting: { kind: 'unsettled' },
        forecast: record.forecast,
        continuation: record.continuation,
      },
    }
  }

  /**
   * The token of the current fixed adoption of a target: the generation of this source fiber with
   * the order and the fixed basis of the fact, or with `none` and the target scope while there is
   * none. It changes when a new M0 is saved, and only then within one generation.
   */
  private async adoptedCount(input: AdoptedRead<unknown>): Promise<SourceRead<GroupToken>> {
    const fact = await this.adoptedFact(input)
    if (fact.kind !== 'value') return fact
    const parts =
      fact.value === null
        ? [this.revision, 'none', input.target.scope.ref]
        : [this.revision, fact.value.order, fact.value.committed.digest]
    const hash = createHash('sha256').update(canonical(parts)).digest('hex')
    const token = decodeGroupToken(`session-ad04/adopted/${hash}`)
    return 'ok' in token
      ? { kind: 'value', value: token.ok }
      : this.defect('the adoption token is not a group token')
  }

  private async read(
    input: Parameters<HistorySource<unknown>['read']>[0],
  ): Promise<HistoryReadResult> {
    const checked = checkEvidence(input.evidence)
    if (checked.kind === 'invalid') return checked
    const { evidence } = checked
    const located = this.locate(input.access, evidence.target)
    if (located.kind !== 'located') return located
    const cursor: HistoryCursor | null = input.cursor
    const unreadable = readRefusal(input.budgetBytes, cursor, evidence)
    if (unreadable !== undefined) return unreadable
    const view = await this.viewAfter(
      located,
      basisOf(evidence),
      cursor === null ? 0n : BigInt(sessionSeqOf(cursor.after)),
      input.budgetBytes,
      'cursor',
    )
    if (view.kind === 'epoch-changed') return this.epochChanged(located, view.current)
    if (view.kind !== 'page') return view
    const rows = this.translateRows(view.rows)
    if (!Array.isArray(rows)) return rows
    const last = rows.at(-1)
    if (!view.more || last === undefined) return { kind: 'page', page: { rows, next: null } }
    return { kind: 'page', page: { rows, next: { evidence, after: last.seq } } }
  }

  /** The answer of a read whose basis moved on: the evidence of the current basis. */
  private epochChanged(
    located: Located,
    basis: ModelViewBasis,
  ): Unavailable | Readonly<{ kind: 'epoch-changed'; current: HistoryEvidence }> {
    const current = evidenceOf(located.target, basis)
    return current === undefined
      ? this.defect('the current model view basis is not a history evidence')
      : { kind: 'epoch-changed', current }
  }

  /** The history rows of model view rows; a row that does not translate is a defect. */
  private translateRows(source: readonly ModelViewRow[]): HistoryRow[] | Unavailable {
    const rows: HistoryRow[] = []
    for (const row of source) {
      const translated = rowOf(row)
      if (translated === undefined)
        return this.defect(`model view row ${row.seq} does not translate`)
      rows.push(translated)
    }
    return rows
  }

  /**
   * The model view rows after the Session row `after` under `basis`, at most `budget` bytes of them
   * (at least one row), and whether more follow. Session cursors are opaque: this reader never
   * decodes one. It keeps, per session and epoch, the cursor Session issued after each row it has
   * seen and the size of each row (`CursorBook`), and starts each read at the kept cursor nearest
   * before `after`, skipping the rows up to `after`. Within one read it moves on with the cursor
   * of its own last page, not with what the book still keeps, so a full book cannot send it back.
   * A page that reaches the upper bound carries no cursor, so after such a page the reader asks
   * Session once more for the rows before the last one (`mint`): the next read, after the upper
   * bound of this one, then starts one row before it. With no cursor near `after` (a cold start,
   * another epoch, a cursor Session no longer accepts) the read starts at the beginning of the
   * epoch and skips the rows it already has.
   */
  private async viewAfter(
    located: Located,
    basis: ModelViewBasis,
    after: bigint,
    budget: number,
    field: string,
    retried = false,
  ): Promise<ViewRead | Refusal> {
    const book = this.bookOf(located, basis.epoch)
    let reach = book.reach(after)
    for (let pages = 0; pages < MAX_PAGES; pages++) {
      const answer = await this.call<ModelViewRead>(() =>
        this.scope[sessionKey].history.readModelView({
          ...located.session,
          basis,
          after: reach.token,
          pageBytes: budget + skippedBytes(book, reach.position, after),
        }),
      )
      if ('failure' in answer) {
        // A cursor Session refuses (expired, or signed by a key it dropped): forget the book and
        // read once more from the start, which needs no cursor.
        if (staleCursor(reach.token, answer.failure, retried)) {
          this.cursors.delete(book.key)
          return this.viewAfter(located, basis, after, budget, field, true)
        }
        return refusalOf(answer.failure, field)
      }
      const view = answer.ok
      if (view.kind === 'epoch-changed') return view
      const defect = this.learn(book, basis, view, reach.position)
      if (defect !== undefined) return defect
      const page = await this.pageAfter(located, basis, book, view, after, budget)
      if (page !== undefined) return page
      const last = view.rows.at(-1)
      if (view.next === null || last === undefined) return { kind: 'page', rows: [], more: false }
      reach = { position: BigInt(last.seq), token: view.next }
    }
    return unavailable('the model view read did not reach the cursor')
  }

  /**
   * The page of `view` that holds the rows after `after`, or undefined when it holds none. A page
   * that reaches the upper bound without a cursor makes the reader mint the cursor before its last row.
   */
  private async pageAfter(
    located: Located,
    basis: ModelViewBasis,
    book: CursorBook,
    view: Extract<ModelViewRead, { kind: 'page' }>,
    after: bigint,
    budget: number,
  ): Promise<ViewRead | undefined> {
    const last = view.rows.at(-1)
    const kept = view.rows.filter(row => BigInt(row.seq) > after)
    if (last === undefined || kept.length === 0) return undefined
    if (view.next === null && last.seq === basis.upper)
      await this.mint(located, basis, book, BigInt(basis.upper) - 1n)
    return pageWithin(kept, budget, view.next !== null)
  }

  /**
   * Takes what one page taught: the size of each row and the cursor after its last row. A page of
   * another basis, a row that does not translate, a cursor that follows no row and a page that
   * does not move past `position` are translation defects, never a success.
   */
  private learn(
    book: CursorBook,
    basis: ModelViewBasis,
    view: Extract<ModelViewRead, { kind: 'page' }>,
    position: bigint,
  ): Unavailable | undefined {
    if (view.basis.epoch !== basis.epoch || view.basis.upper !== basis.upper)
      return this.defect('the model view page names another basis')
    for (const row of view.rows) {
      const seq = sessionRowOf(row.seq)
      if (seq === undefined || !Number.isSafeInteger(row.bytes) || row.bytes < 0)
        return this.defect(`model view row ${row.seq} does not translate`)
      book.size(seq, row.bytes)
    }
    const last = view.rows.at(-1)
    if (last === undefined) {
      return view.next === null ? undefined : this.defect('the model view cursor follows no row')
    }
    if (BigInt(last.seq) <= position) return this.defect('the model view page does not move on')
    if (view.next !== null) book.remember(BigInt(last.seq), view.next)
    return undefined
  }

  /**
   * Asks Session for the cursor after the row `target` of `basis`: one page of exactly the rows
   * between the nearest kept cursor and `target`, whose sizes the reader has seen. It only adds to
   * the book; a refusal or a page of another shape leaves the book as it was, and the next read
   * then starts further back.
   */
  private async mint(
    located: Located,
    basis: ModelViewBasis,
    book: CursorBook,
    target: bigint,
  ): Promise<void> {
    for (let pages = 0; pages < MAX_PAGES; pages++) {
      const { position, token } = book.reach(target)
      if (position === target) return
      const pageBytes = book.span(position, target)
      if (pageBytes === undefined) return
      const answer = await this.call<ModelViewRead>(() =>
        this.scope[sessionKey].history.readModelView({
          ...located.session,
          basis,
          after: token,
          pageBytes,
        }),
      )
      if ('failure' in answer || answer.ok.kind !== 'page') return
      const last = answer.ok.rows.at(-1)
      const row = last === undefined ? undefined : sessionRowOf(last.seq)
      if (answer.ok.next === null || row === undefined || row <= position || row > target) return
      book.remember(row, answer.ok.next)
    }
  }

  /** The cursor book of the session of `located` for `epoch`; another epoch starts a new one. */
  private bookOf(located: Located, epoch: string): CursorBook {
    const key = `${located.tenant}\u0000${located.session.session}`
    let book = this.cursors.get(key)
    this.cursors.delete(key)
    if (book === undefined || book.epoch !== epoch) book = new CursorBook(key, epoch)
    this.cursors.set(key, book)
    while (this.cursors.size > CURSOR_SESSIONS) {
      const oldest = this.cursors.keys().next().value
      if (oldest === undefined) break
      this.cursors.delete(oldest)
    }
    return book
  }

  /** The session that a history evidence names, when the access of `tenant` may name it. */
  private headOf(
    evidence: unknown,
    tenant: string,
  ): Readonly<{ kind: 'head'; head: SessionHistoryHead; tenant: string }> | Refusal {
    if (typeof evidence !== 'object' || evidence === null)
      return invalid('evidence', 'missing-input')
    let head: SessionHistoryHead | null
    try {
      head = this.shared.input.heads.sessionOf(evidence as DurableEvidence)
    } catch (cause) {
      return unavailable(`the history head decoder threw: ${describe(cause)}`)
    }
    if (head === null) return invalid('evidence', 'source-evidence-conflict')
    const headTenant = tenantText(head.tenant)
    if (headTenant === undefined) return this.defect('the history head names no minted tenant')
    return headTenant === tenant ? { kind: 'head', head, tenant: headTenant } : DENIED
  }

  /** The scope refs of the context scope bindings of a session, oldest first. */
  private scopesOf(bindings: readonly { scope: string }[]): ScopeRef[] | Unavailable {
    const scopes: ScopeRef[] = []
    for (const binding of bindings) {
      const decoded = decodeScopeRef({ ref: binding.scope })
      if (!('ok' in decoded)) return this.defect(`scope ${binding.scope} is not a scope ref`)
      scopes.push(decoded.ok)
    }
    return scopes
  }

  private async resolve(
    input: Parameters<HistoryEvidenceResolver<unknown>>[0],
  ): Promise<SourceRead<HistoryEvidence>> {
    if (this.state.closed) return unavailable('the reads closed')
    const checked = checkAccess(input.access)
    if (checked.kind !== 'checked') return checked
    const named = this.headOf(input.evidence, checked.tenant)
    if (named.kind !== 'head') return named
    const { head, tenant: headTenant } = named
    const work = this.shared.link.work
    if (work === undefined) return unavailable('the lower bound sub-plugin is not running')
    const session: SessionAccess<unknown> = { ...checked.access, session: head.session }
    const found = await this.currentScope(work, session, head, headTenant)
    if (!('scope' in found)) return found
    const { scope } = found
    const view = await this.call<ModelViewRead>(() =>
      this.scope[sessionKey].history.readModelView({
        ...session,
        basis: null,
        after: null,
        pageBytes: 1,
      }),
    )
    if ('failure' in view) return refusalOf(view.failure, 'evidence')
    const basis = view.ok.kind === 'page' ? view.ok.basis : view.ok.current
    const resolved = evidenceOf({ tenant: head.tenant, scope }, basis)
    return resolved === undefined
      ? this.defect('the current model view basis is not a history evidence')
      : { kind: 'value', value: resolved }
  }

  /**
   * The current context scope of the session of `head`, read from its open work. Every binding of
   * the session is a fact of its log and is remembered; the newest scope is the current one.
   */
  private async currentScope(
    work: NonNullable<Shared['link']['work']>,
    session: SessionAccess<unknown>,
    head: SessionHistoryHead,
    headTenant: string,
  ): Promise<Readonly<{ scope: ScopeRef }> | Refusal> {
    const snapshot = await this.call(() => work.readWork(session))
    if ('failure' in snapshot) return refusalOf(snapshot.failure, 'evidence')
    const work0 = snapshot.ok
    if (tenantText(work0.tenant) !== headTenant || work0.session !== head.session)
      return this.defect('readWork answered another session')
    const bindings = work0.contextScopes ?? []
    const scopes = this.scopesOf(bindings)
    if (!Array.isArray(scopes)) return scopes
    const current = bindings.at(-1)
    const scope = scopes.at(-1)
    if (current === undefined || scope === undefined)
      return unavailable('the session has no context scope')
    for (const each of scopes) this.remember(indexKey(headTenant, each), head)
    if (current.ended !== null) return unavailable('the context scope of the session has ended')
    return { scope }
  }

  private remember(key: string, head: SessionHistoryHead): void {
    const { index } = this.shared
    index.delete(key)
    index.set(key, head)
    const limit = this.shared.input.scopeIndexEntries ?? SCOPE_INDEX_ENTRIES
    while (index.size > limit) {
      const oldest = index.keys().next().value
      if (oldest === undefined) break
      index.delete(oldest)
    }
  }

  /** The row of `upper` under `basis`, or why it is not there. */
  private async upperRow(
    located: Located,
    evidence: HistoryEvidence,
  ): Promise<
    | Readonly<{ kind: 'row'; entry: string | null }>
    | Readonly<{ kind: 'epoch-changed'; current: HistoryEvidence }>
    | Refusal
  > {
    const basis = basisOf(evidence)
    const view = await this.viewAfter(
      located,
      basis,
      evidence.upper.kind === 'empty' ? 0n : BigInt(basis.upper) - 1n,
      1,
      'evidence',
    )
    if (view.kind === 'epoch-changed') return this.epochChanged(located, view.current)
    if (view.kind !== 'page') return view
    if (evidence.upper.kind === 'empty') return { kind: 'row', entry: null }
    const row = view.rows[0]
    if (row === undefined || row.seq !== basis.upper)
      return this.defect('the model view has no row at the upper bound')
    return { kind: 'row', entry: row.entry }
  }

  /** Every entry of the session log, forward; a read that ends early is not complete. */
  private async entries(
    session: SessionAccess<unknown>,
  ): Promise<Outcome<readonly HistoryEntry[], Refusal>> {
    const pageBytes = this.shared.input.pageBytes ?? PAGE_BYTES
    const entries: HistoryEntry[] = []
    let page = await this.call<HistoryPage>(() =>
      this.scope[sessionKey].history.begin({
        ...session,
        kinds: [],
        from: null,
        direction: 'forward',
        pageBytes,
      }),
    )
    for (let pages = 1; ; pages++) {
      if ('failure' in page) return { failure: refusalOf(page.failure, 'evidence') }
      entries.push(...page.ok.entries)
      if (page.ok.exhausted) return { ok: entries }
      const cursor = page.ok.next
      if (cursor === null || pages >= MAX_PAGES)
        return { failure: unavailable('the history read ended before it was exhausted') }
      page = await this.call<HistoryPage>(() =>
        this.scope[sessionKey].history.next({ ...session, cursor }),
      )
    }
  }

  /**
   * The CM-02 judgment window under one evidence: the full log read as `reader`, the open work read
   * as `coordinator` by the lower bound sub-plugin, cut at the entry of the fixed upper. The basis is
   * read before and after, so a compaction committed meanwhile answers `epoch-changed`.
   */
  private async compactionContext(
    input: Parameters<HistorySource<unknown>['compactionContext']>[0],
  ): Promise<CompactionContextResult> {
    const checked = checkEvidence(input.evidence)
    if (checked.kind === 'invalid') return checked
    const { evidence } = checked
    const located = this.locate(input.access, evidence.target)
    if (located.kind !== 'located') return located
    if (typeof input.coverTo !== 'string' || parseRecordEntryRef(input.coverTo) === null)
      return invalid('coverTo', 'missing-input')
    const work = this.shared.link.work
    if (work === undefined) return unavailable('the lower bound sub-plugin is not running')

    const upper = await this.upperRow(located, evidence)
    if (upper.kind !== 'row') return upper
    if (upper.entry === null) return invalid('coverTo', 'upper-out-of-range')
    const read = await this.entries(located.session)
    if ('failure' in read) return read.failure
    const snapshot = await this.call(() => work.readWork(located.session))
    if ('failure' in snapshot) return refusalOf(snapshot.failure, 'evidence')

    const entries = read.ok
    const end = entries.findIndex(entry => entry.id === upper.entry)
    if (end < 0) return this.defect('the history read does not hold the entry of the upper bound')
    const cover = entries.findIndex(entry => String(entry.id) === String(input.coverTo))
    if (cover < 0 || cover > end) return invalid('coverTo', 'upper-out-of-range')
    let window: CompactionContext | null
    try {
      window = compactionReads(entries, snapshot.ok, input.coverTo)
    } catch (cause) {
      return this.defect(`the compaction window does not translate: ${describe(cause)}`)
    }
    if (window === null)
      return unavailable('the open work names entries that the history read does not hold')
    const within = new Set<string>(entries.slice(0, end + 1).map(entry => String(entry.id)))
    const value: CompactionContext = {
      ...window,
      after: window.after.filter(row => within.has(row.ref)),
      open: window.open.filter(ref => within.has(ref)),
    }

    const again = await this.upperRow(located, evidence)
    if (again.kind !== 'row') return again
    return { kind: 'context', value, evidence }
  }
}

// --- the factory -----------------------------------------------------------------------------------

/**
 * The AD-04 sub-plugins. Mount both; each stays `PENDING` while `session` is absent. Without the
 * lower bound sub-plugin the source sub-plugin still provides `contextHolderSources`; its resolver
 * and its compaction window answer unavailable.
 */
export function createSessionHistorySource(input: SessionHistorySourceInput) {
  const shared: Shared = {
    input,
    index: new Map(),
    link: { work: undefined },
    generations: 0,
    latest: undefined,
  }
  return {
    /** `session-ad04`: provides `contextHolderSources`; calls `session` as `reader`. */
    source: {
      name: 'session-ad04',
      inject: { [sessionKey]: { caller: 'reader' as const } },
      apply(ctx: Context) {
        new SessionHolderSources(ctx, shared)
      },
    },
    /** `session-ad04-lower-bound`: reads `readWork` as `coordinator` for the source sub-plugin. */
    lowerBound: {
      name: 'session-ad04-lower-bound',
      inject: { [sessionKey]: { caller: 'coordinator' as const } },
      apply(ctx: Context) {
        const reads: WorkReads = { readWork: access => ctx[sessionKey].work.readWork(access) }
        shared.link.work = reads
        ctx.effect(
          () => () => {
            if (shared.link.work === reads) shared.link.work = undefined
          },
          'session-ad04.lower-bound',
        )
      },
    },
    /** True once the latest source fiber has closed the reads it lent, or before the first one. */
    readsClosed: () => shared.latest?.closed ?? true,
  }
}
