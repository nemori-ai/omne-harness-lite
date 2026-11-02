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
// (process lifetime, bounded) and the lease bookkeeping of one source fiber. Named gaps: the
// decoding of a history head evidence to its session is handed in as `heads`; the fixed request
// facts of the narrow adoption source are handed in as `adopted`, and without them that part answers
// unavailable after its access check (NP-02).
import type { Context } from '@deepseek-ai/cordis'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { parseRecordEntryRef, type CompactionContext } from '@omne-harness/message'
import type { Outcome } from '@omne-harness/operation-result'
import {
  decodeEpochId,
  decodeGroupToken,
  decodeHistorySequence,
  type Access,
  type AdoptedRead,
  type AdoptedRequestSource,
  type CompactionContextResult,
  type ContextReadEligibility,
  type ContextTarget,
  type DurableEvidence,
  type EpochId,
  type GroupToken,
  type HistoryCursor,
  type HistoryEvidence,
  type HistoryEvidenceResolver,
  type HistoryReadResult,
  type HistoryRow,
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
import { sessionKey } from '@omne-harness/session-cordis-contract/cordis'
import { compactionReads } from '../testing/session-values.ts'

const LOGGER = 'session-adapters/history-source'
/** The initial bound of the scope-to-session index; the assembly may set another (IC-14). */
const SCOPE_INDEX_ENTRIES = 4096
/** The initial page size of the full history read of a compaction window (IC-14). */
const PAGE_BYTES = 65536
/** A history read that has not ended after this many pages is not a complete read. */
const MAX_PAGES = 10000

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
  /**
   * The fixed request facts of the coordinator (CX-08). The holder adds the access check of every
   * call. Absent, the narrow adoption source answers unavailable after its access check.
   */
  adopted?: AdoptedRequestSource<unknown>
  /** The most scopes the scope-to-session index keeps; the oldest goes first. */
  scopeIndexEntries?: number
  /** The page size of the full history read of a compaction window. */
  pageBytes?: number
}>

/** The authority the narrow adoption source names while no fixed request facts are handed in. */
const ABSENT_ADOPTED: AdoptedRequestSource<unknown>['authority'] = {
  owner: '@omne-harness/session-adapters',
  name: 'session-ad04/adopted-absent',
  revision: '1',
  digest: 'session-ad04:adopted-absent',
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

/** `"0"` is the empty history; any other canonical decimal is an entry. */
function upperOf(text: string): HistoryUpper | undefined {
  if (text === '0') return { kind: 'empty' }
  const decoded = decodeHistorySequence(text)
  return 'ok' in decoded ? { kind: 'entry', seq: decoded.ok } : undefined
}

function basisOf(evidence: HistoryEvidence): ModelViewBasis {
  return {
    epoch: sessionEpochOf(evidence.epoch),
    upper: evidence.upper.kind === 'empty' ? '0' : evidence.upper.seq,
  }
}

function evidenceOf(target: ContextTarget, basis: ModelViewBasis): HistoryEvidence | undefined {
  const epoch = epochOf(basis.epoch)
  const upper = upperOf(basis.upper)
  return epoch === undefined || upper === undefined ? undefined : { target, epoch, upper }
}

function rowOf(row: ModelViewRow): HistoryRow | undefined {
  const seq = decodeHistorySequence(row.seq)
  const entry = parseRecordEntryRef(row.entry)
  if (!('ok' in seq) || entry === null || !Number.isSafeInteger(row.bytes) || row.bytes < 0)
    return undefined
  // No model view row carries its original Model call, so no row has `sourceCall` (SPEC AD-04 3).
  return {
    seq: seq.ok,
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
    await Promise.allSettled([...this.pending])
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
    const handed = this.shared.input.adopted
    const adoptedRead = async <T>(
      input: AdoptedRead<unknown>,
      read: (source: AdoptedRequestSource<unknown>) => Promise<SourceRead<T>>,
    ): Promise<SourceRead<T>> => {
      const admitted = await this.admitted(input.access, input.target)
      if (admitted.kind !== 'located') return admitted
      if (handed === undefined)
        return unavailable('adopted-facts-absent: no fixed request facts are handed in (NP-02)')
      try {
        return await read(handed)
      } catch (cause) {
        return unavailable(`the narrow adoption source threw: ${describe(cause)}`)
      }
    }
    const adopted: AdoptedRequestSource<unknown> = {
      authority: handed?.authority ?? ABSENT_ADOPTED,
      readCount: input => adoptedRead(input, source => source.readCount(input)),
      readSource: input => adoptedRead(input, source => source.readSource(input)),
    }
    const resolveHistory: HistoryEvidenceResolver<unknown> = input => this.resolve(input)
    return { history, adopted, eligibility, resolveHistory }
  }

  private async read(
    input: Parameters<HistorySource<unknown>['read']>[0],
  ): Promise<HistoryReadResult> {
    const checked = checkEvidence(input.evidence)
    if (checked.kind === 'invalid') return checked
    const { evidence } = checked
    const located = this.locate(input.access, evidence.target)
    if (located.kind !== 'located') return located
    if (!Number.isSafeInteger(input.budgetBytes) || input.budgetBytes < 1)
      return invalid('budgetBytes', 'missing-input')
    const cursor: HistoryCursor | null = input.cursor
    if (
      cursor !== null &&
      (typeof cursor !== 'object' ||
        typeof cursor.after !== 'string' ||
        !('ok' in decodeHistorySequence(cursor.after)) ||
        typeof cursor.evidence !== 'object' ||
        cursor.evidence === null ||
        checkEvidence(cursor.evidence).kind === 'invalid' ||
        !sameEvidence(cursor.evidence, evidence))
    )
      return invalid('cursor', 'cursor-invalidated')
    const basis = basisOf(evidence)
    const answer = await this.call<ModelViewRead>(() =>
      this.scope[sessionKey].history.readModelView({
        ...located.session,
        basis,
        after: cursor?.after ?? null,
        pageBytes: input.budgetBytes,
      }),
    )
    if ('failure' in answer) return refusalOf(answer.failure, 'cursor')
    const view = answer.ok
    if (view.kind === 'epoch-changed') {
      const current = evidenceOf(located.target, view.current)
      return current === undefined
        ? this.defect('the current model view basis is not a history evidence')
        : { kind: 'epoch-changed', current }
    }
    if (view.basis.epoch !== basis.epoch || view.basis.upper !== basis.upper)
      return this.defect('the model view page names another basis')
    const rows: HistoryRow[] = []
    for (const row of view.rows) {
      const translated = rowOf(row)
      if (translated === undefined)
        return this.defect(`model view row ${row.seq} does not translate`)
      rows.push(translated)
    }
    if (view.next === null) return { kind: 'page', page: { rows, next: null } }
    const after = decodeHistorySequence(view.next)
    if (!('ok' in after)) return this.defect('the model view cursor is not a history sequence')
    return { kind: 'page', page: { rows, next: { evidence, after: after.ok } } }
  }

  private async resolve(
    input: Parameters<HistoryEvidenceResolver<unknown>>[0],
  ): Promise<SourceRead<HistoryEvidence>> {
    if (this.state.closed) return unavailable('the reads closed')
    const checked = checkAccess(input.access)
    if (checked.kind !== 'checked') return checked
    const { evidence } = input
    if (typeof evidence !== 'object' || evidence === null)
      return invalid('evidence', 'missing-input')
    let head: SessionHistoryHead | null
    try {
      head = this.shared.input.heads.sessionOf(evidence)
    } catch (cause) {
      return unavailable(`the history head decoder threw: ${describe(cause)}`)
    }
    if (head === null) return invalid('evidence', 'source-evidence-conflict')
    const headTenant = tenantText(head.tenant)
    if (headTenant === undefined) return this.defect('the history head names no minted tenant')
    if (headTenant !== checked.tenant) return DENIED
    const work = this.shared.link.work
    if (work === undefined) return unavailable('the lower bound sub-plugin is not running')
    const session: SessionAccess<unknown> = { ...checked.access, session: head.session }
    const snapshot = await this.call(() => work.readWork(session))
    if ('failure' in snapshot) return refusalOf(snapshot.failure, 'evidence')
    const work0 = snapshot.ok
    if (tenantText(work0.tenant) !== headTenant || work0.session !== head.session)
      return this.defect('readWork answered another session')
    const bindings = work0.contextScopes ?? []
    const scopes: ScopeRef[] = []
    for (const binding of bindings) {
      const decoded = decodeScopeRef({ ref: binding.scope })
      if (!('ok' in decoded)) return this.defect(`scope ${binding.scope} is not a scope ref`)
      scopes.push(decoded.ok)
    }
    const current = bindings.at(-1)
    const scope = scopes.at(-1)
    if (current === undefined || scope === undefined)
      return unavailable('the session has no context scope')
    // Every binding of the session is a fact of its log; the newest scope is the current one.
    for (const each of scopes) this.remember(indexKey(headTenant, each), head)
    if (current.ended !== null) return unavailable('the context scope of the session has ended')
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
    const after = evidence.upper.kind === 'empty' ? null : String(BigInt(basis.upper) - 1n)
    const answer = await this.call<ModelViewRead>(() =>
      this.scope[sessionKey].history.readModelView({
        ...located.session,
        basis,
        after,
        pageBytes: 1,
      }),
    )
    if ('failure' in answer) return refusalOf(answer.failure, 'evidence')
    const view = answer.ok
    if (view.kind === 'epoch-changed') {
      const current = evidenceOf(located.target, view.current)
      return current === undefined
        ? this.defect('the current model view basis is not a history evidence')
        : { kind: 'epoch-changed', current }
    }
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
