import { contextEpochOf, sessionEpochOf } from './history-epoch.ts'
import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { parseRecordEntryRef } from '@omne-harness/message'
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
  ModelViewBasis,
  ModelViewRead,
  ModelViewRow,
  SessionAccess,
  SessionFailure,
  SessionId,
  ContextScopeBinding,
} from '@omne-harness/session-contract'
import type {
  SessionAdoptedRequest,
  SessionAdoptedRequestRead,
  SessionAdoptedRequests,
} from '@omne-harness/session-cordis-contract'
import { sessionAdoptedRequestsKey, sessionKey } from '@omne-harness/session-cordis-contract/cordis'
import { canonical } from '../testing/canonical.ts'

const LOGGER = 'session-adapters/history-source'
const SCOPE_INDEX_ENTRIES = 4096
const PAGE_BYTES = 65536
const MAX_PAGES = 10000
const CURSOR_SESSIONS = 1024
const CURSORS_PER_SESSION = 16
const SIZES_PER_SESSION = 65536

export type SessionHistoryHead = Readonly<{ tenant: TenantId; session: SessionId }>

export interface SessionHistoryHeads {
  sessionOf(evidence: DurableEvidence): SessionHistoryHead | null
}

export type SessionHistorySourceInput = Readonly<{
  heads: SessionHistoryHeads
  scopeIndexEntries?: number
  pageBytes?: number
}>

const ADOPTED_AUTHORITY: AdoptedRequestSource<unknown>['authority'] = {
  owner: '@omne-harness/session-adapters',
  name: 'session-ad04/adopted',
  revision: '1',
  digest: 'session-ad04:adopted',
}

function coverageDigest(coverage: Coverage): string {
  return createHash('sha256').update(canonical(coverage)).digest('base64url')
}

interface WorkReads {
  readCurrentScope(
    access: SessionAccess<unknown>,
  ): Promise<Outcome<ContextScopeBinding | null, SessionFailure>>
}

type Shared = {
  readonly input: SessionHistorySourceInput
  readonly index: Map<string, SessionHistoryHead>
  readonly link: { work: WorkReads | undefined }
  generations: number
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

function historySeqOf(seq: string): HistorySequence | undefined {
  const decoded = decodeHistorySequence(seq)
  if (!('ok' in decoded) || decoded.ok === '0') return undefined
  const shifted = decodeHistorySequence(String(BigInt(decoded.ok) - 1n))
  return 'ok' in shifted ? shifted.ok : undefined
}

function sessionSeqOf(seq: HistorySequence): string {
  return String(BigInt(seq) + 1n)
}

function sessionRowOf(seq: string): bigint | undefined {
  return historySeqOf(seq) === undefined ? undefined : BigInt(seq)
}

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
  const epoch = contextEpochOf(basis.epoch)
  const upper = upperOf(basis.upper)
  return epoch === undefined || upper === undefined ? undefined : { target, epoch, upper }
}

function rowOf(row: ModelViewRow): HistoryRow | undefined {
  const seq = historySeqOf(row.seq)
  const entry = parseRecordEntryRef(row.entry)
  if (seq === undefined || entry === null || !Number.isSafeInteger(row.bytes) || row.bytes < 0)
    return undefined
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

type ViewRead =
  | Readonly<{ kind: 'page'; rows: readonly ModelViewRow[]; more: boolean }>
  | Readonly<{ kind: 'epoch-changed'; current: ModelViewBasis }>

class CursorBook {
  readonly key: string
  readonly epoch: string
  readonly tokens = new Map<bigint, string>()
  private readonly sizes = new Map<bigint, number>()

  constructor(key: string, epoch: string) {
    this.key = key
    this.epoch = epoch
  }

  reach(after: bigint): Reach {
    let best = 0n
    for (const row of this.tokens.keys()) if (row <= after && row > best) best = row
    return { position: best, token: best === 0n ? null : (this.tokens.get(best) ?? null) }
  }

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

  remember(row: bigint, token: string): void {
    this.tokens.set(row, token)
    while (this.tokens.size > CURSORS_PER_SESSION) dropLowest(this.tokens, row)
  }
}

function dropLowest(map: Map<bigint, unknown>, keep?: bigint): void {
  let lowest: bigint | undefined
  for (const row of map.keys())
    if (row !== keep && (lowest === undefined || row < lowest)) lowest = row
  if (lowest !== undefined) map.delete(lowest)
}

type Reach = Readonly<{ position: bigint; token: string | null }>

function skippedBytes(book: CursorBook, position: bigint, after: bigint): number {
  return position === after ? 0 : (book.span(position, after) ?? PAGE_BYTES)
}

function staleCursor(token: string | null, failure: SessionFailure, retried: boolean): boolean {
  return token !== null && failure.kind === 'invalid' && !retried
}

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

type Checked = Readonly<{ kind: 'checked'; tenant: string; access: Access<unknown> }>

function checkAccess(access: unknown): Checked | Invalid {
  if (typeof access !== 'object' || access === null) return invalid('access', 'missing-access')
  const tenant = tenantText((access as Access<unknown>).tenant)
  if (tenant === undefined) return invalid('access', 'missing-access')
  return { kind: 'checked', tenant, access: access as Access<unknown> }
}

type Targeted = Checked & Readonly<{ target: ContextTarget }>

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

type Located = Omit<Targeted, 'kind'> &
  Readonly<{ kind: 'located'; session: SessionAccess<unknown> }>

class SessionHolderSources extends ContextHolderSourcesService<unknown> {
  private readonly scope: Context
  private readonly shared: Shared
  private readonly state = { closing: false, closed: false }
  private readonly pending = new Set<Promise<SourceSettlement>>()
  private readonly revision: GroupToken
  private readonly parts: ContextHolderParts<unknown>
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

  private async close(): Promise<void> {
    this.state.closing = true
    await Promise.allSettled(this.pending)
    this.state.closed = true
  }

  private report(result: PromiseSettledResult<SourceSettlement>): void {
    const logger = this.scope.logger(LOGGER)
    if (result.status === 'rejected')
      logger.warn(`a lease settlement failed: ${describe(result.reason)}`)
    else if (result.value.kind === 'unavailable')
      logger.warn(`a lease settled with outstanding work: ${result.value.outstanding.length}`)
  }

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

  private async adoptedFact(
    input: AdoptedRead<unknown>,
  ): Promise<SourceRead<AdoptedRequestFact | null>> {
    const admitted = await this.admitted(input.access, input.target)
    if (admitted.kind !== 'located') return admitted
    const read = await this.savedOf(admitted)
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

  private async savedOf(located: Located): Promise<SessionAdoptedRequestRead> {
    let requests: SessionAdoptedRequests<unknown> | undefined
    try {
      requests = this.scope.get(sessionAdoptedRequestsKey)
    } catch (cause) {
      return unavailable(`the adopted request reads are not readable: ${describe(cause)}`)
    }
    if (requests === undefined)
      return unavailable('adopted-requests-absent: sessionAdoptedRequests is not provided')
    try {
      return await requests.readAdoptedRequest({
        access: located.access,
        session: located.session.session,
      })
    } catch (cause) {
      return unavailable(`the adopted request read threw: ${describe(cause)}`)
    }
  }

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

  private epochChanged(
    located: Located,
    basis: ModelViewBasis,
  ): Unavailable | Readonly<{ kind: 'epoch-changed'; current: HistoryEvidence }> {
    const current = evidenceOf(located.target, basis)
    return current === undefined
      ? this.defect('the current model view basis is not a history evidence')
      : { kind: 'epoch-changed', current }
  }

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

  private async currentScope(
    work: NonNullable<Shared['link']['work']>,
    session: SessionAccess<unknown>,
    head: SessionHistoryHead,
    headTenant: string,
  ): Promise<Readonly<{ scope: ScopeRef }> | Refusal> {
    const answer = await this.call(() => work.readCurrentScope(session))
    if ('failure' in answer) return refusalOf(answer.failure, 'evidence')
    const current = answer.ok
    if (current === null) return unavailable('the session has no context scope')
    const decoded = decodeScopeRef({ ref: current.scope })
    if (!('ok' in decoded)) return this.defect(`scope ${current.scope} is not a scope ref`)
    const scope = decoded.ok
    this.remember(indexKey(headTenant, scope), head)
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

  private async compactionContext(
    input: Parameters<HistorySource<unknown>['compactionContext']>[0],
  ): Promise<CompactionContextResult> {
    const checked = checkEvidence(input.evidence)
    if (checked.kind === 'invalid') return checked
    const { evidence } = checked
    const located = this.locate(input.access, evidence.target)
    if (located.kind !== 'located') return located
    if (
      input.coverTo !== null &&
      (typeof input.coverTo !== 'string' || parseRecordEntryRef(input.coverTo) === null)
    )
      return invalid('coverTo', 'missing-input')
    const work = this.shared.link.work
    if (work === undefined) return unavailable('the lower bound sub-plugin is not running')

    const answer = await this.call(() =>
      this.scope[sessionKey].history.readCompactionContext({
        ...located.session,
        basis: basisOf(evidence),
        coverTo: input.coverTo,
      }),
    )
    if ('failure' in answer) {
      if (answer.failure.kind === 'invalid') return invalid('coverTo', 'upper-out-of-range')
      return refusalOf(answer.failure, 'evidence')
    }
    if (answer.ok.kind === 'epoch-changed') return this.epochChanged(located, answer.ok.current)
    return { kind: 'context', value: answer.ok.value, evidence }
  }
}

export function createSessionHistorySource(input: SessionHistorySourceInput) {
  const shared: Shared = {
    input,
    index: new Map(),
    link: { work: undefined },
    generations: 0,
    latest: undefined,
  }
  return {
    source: {
      name: 'session-ad04',
      inject: { [sessionKey]: { caller: 'reader' as const } },
      apply(ctx: Context) {
        new SessionHolderSources(ctx, shared)
      },
    },
    lowerBound: {
      name: 'session-ad04-lower-bound',
      inject: { [sessionKey]: { caller: 'coordinator' as const } },
      apply(ctx: Context) {
        const reads: WorkReads = {
          readCurrentScope: access => ctx[sessionKey].work.readCurrentScope(access),
        }
        shared.link.work = reads
        ctx.effect(
          () => () => {
            if (shared.link.work === reads) shared.link.work = undefined
          },
          'session-ad04.lower-bound',
        )
      },
    },
    readsClosed: () => shared.latest?.closed ?? true,
  }
}
