// AD-03, the Runtime Context holder of Session (SPEC AD-03, docs/cordis.md): two plugins and the
// `replayFacts` port of `createSessionRuntimeContextTrust`.
//
// - The replay sub-plugin `session-ad03-replay` injects the holder face and `session` with the
//   `reader` caller class. It is the only caller of `applyCommit`. A `committed` notice whose kinds
//   can hold a context record makes it read the session's context records, in log order, and
//   translate each to the Runtime Context commit input it records. A scope it has not recovered in
//   this generation, and an `out-of-order` answer, start a recovery session (1a): `beginReplay`
//   at the scope's last commit, the complete material, `finishReplay`. Afterwards each new record
//   goes to `applyCommit` with its original commit and full input, in log order.
// - The holder plugin `session-ad03` injects the holder face and `session` with the `coordinator`
//   caller class, and provides `runtimeContextReaderEligibility` (K-RC). Its policy: answer the
//   eligibility it issued for the same principal, consumer class and scope while the scope's
//   recovery and registration revision are unchanged; otherwise issue one on the spot from the
//   scope's final registrations, superseding the earlier one.
// - `replayFacts.stepCommittedBlocks` reads the same records again and folds them up to the
//   checkpoint, so C18's trust checks a finished recovery against the log, not against the material.
//
// The Session log is the authority. The plugins keep only derivatives: the scope-to-session index
// (process lifetime, bounded), the recovery state of each scope (one replay fiber), and the issued
// eligibilities (one holder fiber). Named gap: the translation from a committed Session entry to a
// Runtime Context commit input is AD-12's adopted translation protocol. It is not delivered; the
// assembly hands it in as `translation`.
import type { Context } from '@deepseek-ai/cordis'
import { tenantCodec, tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import { fail, type Outcome } from '@omne-harness/operation-result'
import type {
  CommitInput,
  CommitRef,
  ConsumerClass,
  ContextBlockKey,
  EligibilityId,
  NeedBinding,
  NeedBindingRef,
  ReaderEligibilityRequest,
  ReaderEligibilityResult,
  RegistrationChange,
  RegistrationRevision,
  ReplayBlock,
  ReplayMaterial,
  ReplayRef,
  RuntimeContextOperations,
  ScopeRef,
  StepRef,
} from '@omne-harness/runtime-context-contract'
import {
  RuntimeContextReaderEligibilityService,
  runtimeContextKey,
} from '@omne-harness/runtime-context-cordis-contract/cordis'
import type {
  HistoryEntry,
  HistoryPage,
  SessionFailure,
  SessionId,
} from '@omne-harness/session-contract'
import { sessionKey } from '@omne-harness/session-cordis-contract/cordis'
import type { SessionReplayFacts, StepCommittedBlocks } from '../runtime-context-trust.ts'
import type { SessionCoordinatorPrincipalFailure } from './agent-drive.ts'

const LOGGER = 'session-adapters/context-holder'
/** The initial bound of the scope-to-session index; the assembly may set another (IC-14). */
const SCOPE_INDEX_ENTRIES = 4096
/** The initial page size of one history read; the assembly may set another (IC-14). */
const PAGE_BYTES = 65536
/** A read that has not ended after this many pages is not a complete read. */
const MAX_PAGES = 10000

/**
 * AD-12's translation protocol in the reading direction: the Runtime Context commit input that one
 * committed Session entry records. `null` is an entry that records none. A failure is a defect of the
 * translation; the holder reports it and treats the records of that session as unreadable, never as
 * a business refusal.
 */
export interface SessionContextTranslation {
  /** The history entry kinds that can record a Runtime Context commit. */
  readonly kinds: readonly string[]
  commitOf(entry: HistoryEntry): Outcome<CommitInput | null, string>
}

/**
 * What the assembly hands to AD-03: the principal it issues to the coordinator of one session (the
 * same port as AD-14's; the plugins use it for their `session` reads and for the holder face), and
 * the translation protocol.
 */
export type SessionContextHolderInput<P> = Readonly<{
  coordinator(
    input: Readonly<{ tenant: TenantId; session: SessionId }>,
  ): Promise<Outcome<P, SessionCoordinatorPrincipalFailure>>
  translation: SessionContextTranslation
  /** The most scopes the scope-to-session index keeps; the oldest goes first. */
  scopeIndexEntries?: number
  /** The page size of the history reads. */
  pageBytes?: number
}>

type Bound = Readonly<{ tenant: TenantId; session: SessionId }>
type ContextRecord = Readonly<{ entry: HistoryEntry; input: CommitInput }>
type Registered = Readonly<{
  bindings: readonly NeedBinding[]
  checkpointed: boolean
}>

/** What the records of one scope say, up to their last commit. */
type Folded = Readonly<{
  material: ReplayMaterial
  final: ReadonlyMap<ContextBlockKey, Registered>
  /** The checkpointed blocks of the final registration that have a step commit. */
  stepCommitted: readonly ContextBlockKey[]
}>

/** The recovery state of one scope in one replay fiber. */
type ScopeState =
  | Readonly<{ phase: 'failed'; replay: ReplayRef | null }>
  | Readonly<{
      phase: 'open' | 'ended'
      replay: ReplayRef
      /** One number per recovery of this scope in this process: a new one makes held eligibilities stale. */
      recovery: number
      covered: ReadonlySet<string>
      final: ReadonlyMap<ContextBlockKey, Registered>
      revision: RegistrationRevision
    }>

/** What the holder plugin learns about one scope before it answers the handoff. */
type ScopeView =
  | Readonly<{ kind: 'unseen' }>
  | Readonly<{ kind: 'other-tenant' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>
  | Readonly<{ kind: 'ended' }>
  | Readonly<{
      kind: 'open'
      bound: Bound
      recovery: number
      revision: RegistrationRevision
      final: ReadonlyMap<ContextBlockKey, Registered>
    }>

/** The replay fiber as the holder plugin and `replayFacts` see it. */
interface ReplayFiber {
  ensure(scope: ScopeRef, tenant: TenantId): Promise<ScopeView>
  stepCommittedBlocks(scope: ScopeRef, through: CommitRef | null): Promise<StepCommittedBlocks>
}

type Shared<P> = Readonly<{
  input: SessionContextHolderInput<P>
  /** scope text → its session; a derivative of Session's own records, kept across generations. */
  index: Map<string, Bound>
  link: { replay: ReplayFiber | undefined }
  recoveries: { next: number }
}>

function describe(cause: unknown): string {
  try {
    return cause instanceof Error ? cause.message : String(cause)
  } catch {
    return 'a thrown value that has no text'
  }
}

function tenantText(tenant: TenantId): string | undefined {
  const encoded = tenantCodec.encode(tenant)
  return encoded.ok ? encoded.value : undefined
}

/** The scope and tenant of one commit input (RC-02). */
function targetOf(input: CommitInput): Readonly<{ scope: ScopeRef; tenant: TenantId }> {
  switch (input.kind) {
    case 'registration':
      return { scope: input.change.scope, tenant: input.change.tenant }
    case 'step':
      return { scope: input.stepCommit.scope, tenant: input.tenant }
    case 'scope':
      return { scope: input.scope, tenant: input.tenant }
    default: {
      const exhaustive: never = input
      return exhaustive
    }
  }
}

function endsScope(input: CommitInput): boolean {
  return input.scopeEnded === true
}

function applyChange(final: Map<ContextBlockKey, Registered>, change: RegistrationChange): void {
  switch (change.kind) {
    case 'add':
      final.set(change.key, {
        bindings: change.bindings,
        checkpointed:
          change.declaration?.kind === 'stateful' &&
          change.declaration.persistence === 'checkpointed',
      })
      return
    case 'update': {
      const existing = final.get(change.key)
      if (existing !== undefined) final.set(change.key, { ...existing, bindings: change.bindings })
      return
    }
    case 'remove':
      final.delete(change.key)
      return
    default: {
      const exhaustive: never = change
      return exhaustive
    }
  }
}

/**
 * The complete recovery material of one scope from its records (SPEC AD-03 1a step 2): every
 * registration commit in log order, removals included; the full value of the latest step commit of
 * each checkpointed block of the final registration, grouped by its original commit and step, with
 * no updates; the confirmed end. A checkpointed block with no step commit is not in the material
 * (P4 B6 (a)); a step commit from before the block's removal does not count for a later add.
 */
function fold(records: readonly ContextRecord[]): Folded {
  const registrations: { commit: CommitRef; change: RegistrationChange }[] = []
  const final = new Map<ContextBlockKey, Registered>()
  type Latest = Readonly<{ position: number; commit: CommitRef; step: StepRef; value: unknown }>
  const latest = new Map<ContextBlockKey, Latest>()
  let end: ReplayMaterial['end'] = null
  records.forEach(({ input }, position) => {
    switch (input.kind) {
      case 'registration':
        registrations.push({ commit: input.commit, change: input.change })
        applyChange(final, input.change)
        if (input.change.kind === 'remove') latest.delete(input.change.key)
        break
      case 'step':
        for (const block of input.stepCommit.committed)
          latest.set(block.key, {
            position,
            commit: input.commit,
            step: input.stepCommit.step,
            value: block.value,
          })
        break
      case 'scope':
        break
      default: {
        const exhaustive: never = input
        return exhaustive
      }
    }
    if (end === null && endsScope(input)) end = { commit: input.commit }
  })
  const stepCommitted = [...final]
    .filter(([key, registered]) => registered.checkpointed && latest.has(key))
    .map(([key]) => key)

  const groups: { commit: CommitRef; step: StepRef; position: number; blocks: ReplayBlock[] }[] = []
  for (const key of stepCommitted) {
    const value = latest.get(key)
    if (value === undefined) continue
    let group = groups.find(item => item.position === value.position)
    if (group === undefined) {
      group = { commit: value.commit, step: value.step, position: value.position, blocks: [] }
      groups.push(group)
    }
    group.blocks.push({ key, value: value.value, updates: [] })
  }
  groups.sort((left, right) => left.position - right.position)
  return {
    material: {
      registrations,
      checkpoints: groups.map(({ commit, step, blocks }) => ({ commit, step, blocks })),
      end,
    },
    final,
    stepCommitted,
  }
}

/** The records up to and including the one whose commit is `through`; `undefined` if none is. */
function upTo(
  records: readonly ContextRecord[],
  through: CommitRef | null,
): readonly ContextRecord[] | undefined {
  if (through === null) return []
  for (let at = records.length - 1; at >= 0; at--)
    if (records[at]?.input.commit.commit === through.commit) return records.slice(0, at + 1)
  return undefined
}

// --- the replay sub-plugin -----------------------------------------------------------------------

/** The records of one scope, in log order, with the scope as the first record names it. */
type ScopeRecords = Readonly<{ scope: ScopeRef; records: readonly ContextRecord[] }>

type Read<P> =
  | Readonly<{ kind: 'read'; principal: P; scopes: ReadonlyMap<string, ScopeRecords> }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

function startReplay<P>(ctx: Context, shared: Shared<P>): void {
  const holder: RuntimeContextOperations<unknown> = ctx[runtimeContextKey]
  const logger = ctx.logger(LOGGER)
  const { input, index } = shared
  const pageBytes = input.pageBytes ?? PAGE_BYTES
  const limit = input.scopeIndexEntries ?? SCOPE_INDEX_ENTRIES
  const states = new Map<string, ScopeState>()
  const chains = new Map<string, Promise<void>>()
  let closed = false

  function remember(scope: string, bound: Bound): void {
    index.delete(scope)
    index.set(scope, bound)
    while (index.size > limit) {
      const oldest = index.keys().next().value
      if (oldest === undefined) break
      index.delete(oldest)
    }
  }

  /** Runs the work of one session after the work already queued for it. */
  function serialize<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = chains.get(key) ?? Promise.resolve()
    const next = previous.then(task)
    const settled = next.then(
      () => undefined,
      () => undefined,
    )
    chains.set(key, settled)
    void settled.then(() => {
      if (chains.get(key) === settled) chains.delete(key)
    })
    return next
  }

  async function principalOf(bound: Bound): Promise<Outcome<P, string>> {
    try {
      const answer = await input.coordinator(bound)
      return 'ok' in answer
        ? answer
        : fail(`the coordinator principal is not available: ${answer.failure.kind}`)
    } catch (cause) {
      return fail(`the coordinator principal source threw: ${describe(cause)}`)
    }
  }

  /** One page of the history read, or why the read cannot go on. */
  async function pageOf(
    call: () => Promise<Outcome<HistoryPage, SessionFailure>>,
  ): Promise<Outcome<HistoryPage, string>> {
    try {
      const answer = await call()
      return 'ok' in answer ? answer : fail(`the history read answered ${answer.failure.kind}`)
    } catch (cause) {
      return fail(`the history read threw: ${describe(cause)}`)
    }
  }

  /**
   * Every context record of one session, in log order, grouped by scope. A read that ends before it
   * is exhausted, a translation defect, and a record whose tenant is not the session's are not a
   * complete read: the answer is unavailable and nothing is indexed.
   */
  async function readRecords(bound: Bound): Promise<Read<P>> {
    const principal = await principalOf(bound)
    if ('failure' in principal) return { kind: 'unavailable', diagnostic: principal.failure }
    const access = { principal: principal.ok, tenant: bound.tenant, session: bound.session }
    const entries: HistoryEntry[] = []
    let page = await pageOf(() =>
      ctx[sessionKey].history.begin({
        ...access,
        kinds: input.translation.kinds,
        from: null,
        direction: 'forward',
        pageBytes,
      }),
    )
    for (let pages = 1; ; pages++) {
      if ('failure' in page) return { kind: 'unavailable', diagnostic: page.failure }
      entries.push(...page.ok.entries)
      if (page.ok.exhausted) break
      const cursor = page.ok.next
      if (cursor === null || pages >= MAX_PAGES)
        return { kind: 'unavailable', diagnostic: 'the history read ended before it was exhausted' }
      page = await pageOf(() => ctx[sessionKey].history.next({ ...access, cursor }))
    }

    const scopes = new Map<string, { scope: ScopeRef; records: ContextRecord[] }>()
    for (const entry of entries) {
      let translated: Outcome<CommitInput | null, string>
      try {
        translated = input.translation.commitOf(entry)
      } catch (cause) {
        translated = fail(`the translation threw: ${describe(cause)}`)
      }
      if ('failure' in translated) return defect(`entry ${entry.id}: ${translated.failure}`)
      const commit = translated.ok
      if (commit === null) continue
      const target = targetOf(commit)
      if (!tenantEquals(target.tenant, bound.tenant))
        return defect(`entry ${entry.id} names another tenant than its session`)
      const group = scopes.get(target.scope.ref) ?? { scope: target.scope, records: [] }
      group.records.push({ entry, input: commit })
      scopes.set(target.scope.ref, group)
    }
    return { kind: 'read', principal: principal.ok, scopes }
  }

  function defect(diagnostic: string): Read<P> {
    logger.error(`translation defect: ${diagnostic}`)
    return { kind: 'unavailable', diagnostic: `translation defect: ${diagnostic}` }
  }

  async function recover(
    principal: P,
    bound: Bound,
    scope: ScopeRef,
    records: readonly ContextRecord[],
    previous: ScopeState | undefined,
  ): Promise<void> {
    const folded = fold(records)
    const through = records.at(-1)?.input.commit ?? null
    const supersedes = previous?.replay ?? null
    let failedReplay = supersedes
    try {
      const begun = await holder.beginReplay(principal, {
        scope,
        tenant: bound.tenant,
        through,
        supersedes,
      })
      if (closed) return
      if (begun.kind !== 'replaying') {
        logger.warn(`beginReplay of ${scope.ref} answered ${begun.kind}`)
        states.set(scope.ref, { phase: 'failed', replay: failedReplay })
        return
      }
      failedReplay = begun.replay
      const finished = await holder.finishReplay(principal, {
        replay: begun.replay,
        material: folded.material,
      })
      if (closed) return
      if (finished.kind !== 'ready') {
        logger.warn(`finishReplay of ${scope.ref} answered ${finished.kind}`)
        states.set(scope.ref, { phase: 'failed', replay: failedReplay })
        return
      }
      states.set(scope.ref, {
        phase: finished.state,
        replay: begun.replay,
        recovery: ++shared.recoveries.next,
        covered: new Set(records.map(record => record.input.commit.commit)),
        final: folded.final,
        revision: finished.registrationRevision,
      })
    } catch (cause) {
      logger.warn(`the recovery of ${scope.ref} threw: ${describe(cause)}`)
      if (!closed) states.set(scope.ref, { phase: 'failed', replay: failedReplay })
    }
  }

  /** Applies the records the scope has not covered, in log order; stops at the first one that does not apply. */
  async function catchUp(
    principal: P,
    bound: Bound,
    scope: ScopeRef,
    records: readonly ContextRecord[],
  ): Promise<void> {
    for (const record of records) {
      const state = states.get(scope.ref)
      if (state === undefined || state.phase !== 'open') return
      if (state.covered.has(record.input.commit.commit)) continue
      let answer: Awaited<ReturnType<typeof holder.applyCommit>>
      try {
        answer = await holder.applyCommit(principal, record.input)
      } catch (cause) {
        logger.warn(`applyCommit of ${record.input.commit.commit} threw: ${describe(cause)}`)
        return
      }
      if (closed) return
      switch (answer.kind) {
        case 'applied': {
          const final = new Map(state.final)
          if (record.input.kind === 'registration') applyChange(final, record.input.change)
          states.set(scope.ref, {
            ...state,
            phase: endsScope(record.input) ? 'ended' : 'open',
            covered: new Set([...state.covered, record.input.commit.commit]),
            final,
            revision: answer.registrationRevision,
          })
          continue
        }
        case 'invalid':
          if (answer.reason === 'out-of-order')
            return recover(principal, bound, scope, records, state)
          logger.error(`applyCommit of ${record.input.commit.commit} answered ${answer.reason}`)
          return
        case 'refused':
          if (answer.reason === 'replay-incomplete')
            return recover(principal, bound, scope, records, state)
          if (answer.reason === 'scope-ended') states.set(scope.ref, { ...state, phase: 'ended' })
          else
            logger.warn(
              `applyCommit of ${record.input.commit.commit} was refused: ${answer.reason}`,
            )
          return
        case 'unavailable':
        case 'unknown':
          // The same input applies again later and is recognized: the next notice is the query.
          return
        default: {
          const exhaustive: never = answer
          return exhaustive
        }
      }
    }
  }

  /** Reads the session's records and brings every scope in them up to date. */
  async function sync(bound: Bound): Promise<Readonly<{ ok: true } | { diagnostic: string }>> {
    const read = await readRecords(bound)
    if (read.kind === 'unavailable') return { diagnostic: read.diagnostic }
    for (const [ref, { scope, records }] of read.scopes) {
      if (closed) return { diagnostic: 'the replay sub-plugin has stopped' }
      remember(ref, bound)
      const state = states.get(ref)
      if (state === undefined || state.phase === 'failed')
        await recover(read.principal, bound, scope, records, state)
      else if (state.phase === 'open') await catchUp(read.principal, bound, scope, records)
    }
    return { ok: true }
  }

  function sessionOf(bound: Bound): string | undefined {
    const tenant = tenantText(bound.tenant)
    return tenant === undefined ? undefined : JSON.stringify([tenant, bound.session])
  }

  async function settled(): Promise<void> {
    await Promise.all(chains.values())
  }

  const fiber: ReplayFiber = {
    async ensure(scope, tenant) {
      if (closed) return { kind: 'unavailable', diagnostic: 'the replay sub-plugin has stopped' }
      let bound = index.get(scope.ref)
      if (bound === undefined) {
        // A notice in flight may be about to index the scope.
        await settled()
        bound = index.get(scope.ref)
      }
      if (bound === undefined) return { kind: 'unseen' }
      // The tenant is checked before anything of the session is read.
      if (!tenantEquals(bound.tenant, tenant)) return { kind: 'other-tenant' }
      const key = sessionOf(bound)
      if (key === undefined) return { kind: 'unavailable', diagnostic: 'unminted tenant' }
      const known = states.get(scope.ref)
      if (known === undefined || known.phase === 'failed') {
        const target = bound
        const result = await serialize(key, () => sync(target))
        if ('diagnostic' in result) return { kind: 'unavailable', diagnostic: result.diagnostic }
      }
      const state = states.get(scope.ref)
      if (closed) return { kind: 'unavailable', diagnostic: 'the replay sub-plugin has stopped' }
      if (state === undefined)
        return { kind: 'unavailable', diagnostic: 'the session log holds no record of the scope' }
      switch (state.phase) {
        case 'failed':
          return { kind: 'unavailable', diagnostic: 'the recovery of the scope did not complete' }
        case 'ended':
          return { kind: 'ended' }
        case 'open':
          return {
            kind: 'open',
            bound,
            recovery: state.recovery,
            revision: state.revision,
            final: state.final,
          }
        default: {
          const exhaustive: never = state
          return exhaustive
        }
      }
    },
    // Not serialized with the session's work: a recovery in that work asks these facts.
    async stepCommittedBlocks(scope, through) {
      if (closed) return { kind: 'unavailable' }
      const bound = index.get(scope.ref)
      if (bound === undefined) return { kind: 'unavailable' }
      const read = await readRecords(bound)
      if (read.kind === 'unavailable') return { kind: 'unavailable' }
      const records = upTo(read.scopes.get(scope.ref)?.records ?? [], through)
      if (records === undefined) return { kind: 'unknown' }
      return { kind: 'known', keys: fold(records).stepCommitted }
    },
  }

  ctx.on('session-cordis-contract/committed', (tenant, session, _revision, _source, kinds) => {
    if (closed || !kinds.some(kind => input.translation.kinds.includes(kind))) return
    const bound = { tenant, session }
    const key = sessionOf(bound)
    if (key === undefined) return
    return serialize(key, () => sync(bound)).then(
      () => undefined,
      cause => logger.warn(`the sync of a session failed: ${describe(cause)}`),
    )
  })
  ctx.effect(() => {
    shared.link.replay = fiber
    return () => {
      closed = true
      if (shared.link.replay === fiber) shared.link.replay = undefined
    }
  })
}

// --- the holder plugin and the reader eligibility handoff ----------------------------------------

type Held = Readonly<{
  principal: unknown
  eligibility: EligibilityId
  recovery: number
  revision: RegistrationRevision
}>

/** Structural equality of plain data, so an equal principal value finds its eligibility. */
function same(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null)
    return false
  if (Array.isArray(left) !== Array.isArray(right)) return false
  const a = Object.entries(left)
  const b = new Map<string, unknown>(Object.entries(right))
  return a.length === b.size && a.every(([name, value]) => b.has(name) && same(value, b.get(name)))
}

/**
 * What one consumer class may read from the scope's final registrations (RC-03, RC-06): the keys of
 * its bindings without translation, in the block's own shape, and its translated bindings.
 */
function readableBy(
  final: ReadonlyMap<ContextBlockKey, Registered>,
  consumer: ConsumerClass,
): Readonly<{ keys: readonly ContextBlockKey[]; bindings: readonly NeedBindingRef[] }> {
  const keys = new Set<ContextBlockKey>()
  const bindings: NeedBindingRef[] = []
  for (const registered of final.values())
    for (const binding of registered.bindings) {
      if (binding.need.consumer !== consumer) continue
      if (binding.translate === undefined) keys.add(binding.key)
      else bindings.push({ need: binding.need.name, key: binding.key })
    }
  return { keys: [...keys], bindings }
}

class SessionReaderEligibilityProvider<P> extends RuntimeContextReaderEligibilityService<unknown> {
  private readonly scope: Context
  private readonly shared: Shared<P>
  private readonly held = new Map<string, Held[]>()
  private readonly issuing = new Map<string, Promise<unknown>>()
  private closed = false

  constructor(scope: Context, shared: Shared<P>) {
    super(scope)
    this.scope = scope
    this.shared = shared
    scope.effect(() => () => {
      this.closed = true
      this.held.clear()
    })
  }

  async current(request: ReaderEligibilityRequest<unknown>): Promise<ReaderEligibilityResult> {
    const down = (diagnostic: string): ReaderEligibilityResult => ({
      kind: 'unavailable',
      diagnostic,
    })
    if (this.closed) return down('the holder plugin has stopped')
    const fiber = this.shared.link.replay
    if (fiber === undefined) return down('the replay sub-plugin is not running')
    const view = await fiber.ensure(request.scope, request.tenant)
    switch (view.kind) {
      case 'unseen':
        return down('the holder has not seen this scope in the session log')
      case 'other-tenant':
        return { kind: 'refused' }
      case 'unavailable':
        return down(view.diagnostic)
      case 'ended':
        return { kind: 'absent' }
      case 'open':
        return this.once(`${request.scope.ref}\u0000${request.consumer}`, () =>
          this.issue(request, view),
        )
      default: {
        const exhaustive: never = view
        return exhaustive
      }
    }
  }

  /** One issue at a time per scope and consumer class, so two equal requests share one eligibility. */
  private async once(
    key: string,
    task: () => Promise<ReaderEligibilityResult>,
  ): Promise<ReaderEligibilityResult> {
    const previous = this.issuing.get(key) ?? Promise.resolve()
    const next = previous.then(task, task)
    this.issuing.set(key, next)
    try {
      return await next
    } finally {
      if (this.issuing.get(key) === next) this.issuing.delete(key)
    }
  }

  private async issue(
    request: ReaderEligibilityRequest<unknown>,
    view: Extract<ScopeView, { kind: 'open' }>,
  ): Promise<ReaderEligibilityResult> {
    if (this.closed) return { kind: 'unavailable', diagnostic: 'the holder plugin has stopped' }
    const key = `${request.scope.ref}\u0000${request.consumer}`
    const list = this.held.get(key) ?? []
    const held = list.find(item => same(item.principal, request.principal))
    if (held !== undefined && held.recovery === view.recovery && held.revision === view.revision)
      return { kind: 'current', eligibility: held.eligibility }

    const readable = readableBy(view.final, request.consumer)
    if (readable.keys.length === 0 && readable.bindings.length === 0) return { kind: 'absent' }
    let principal: Outcome<P, SessionCoordinatorPrincipalFailure>
    try {
      principal = await this.shared.input.coordinator(view.bound)
    } catch (cause) {
      return {
        kind: 'unavailable',
        diagnostic: `the coordinator principal threw: ${describe(cause)}`,
      }
    }
    if ('failure' in principal)
      return {
        kind: 'unavailable',
        diagnostic: `the coordinator principal is not available: ${principal.failure.kind}`,
      }
    // An eligibility of an earlier recovery was invalidated by `beginReplay`; it is not superseded.
    let supersedes = held !== undefined && held.recovery === view.recovery ? held.eligibility : null
    for (;;) {
      let answer: Awaited<ReturnType<RuntimeContextOperations<unknown>['issueEligibility']>>
      try {
        answer = await this.scope[runtimeContextKey].issueEligibility(principal.ok, {
          supersedes,
          scope: request.scope,
          consumer: request.consumer,
          principal: request.principal,
          tenant: request.tenant,
          keys: readable.keys,
          bindings: readable.bindings,
          registrationRevision: view.revision,
        })
      } catch (cause) {
        return { kind: 'unavailable', diagnostic: `issueEligibility threw: ${describe(cause)}` }
      }
      if (this.closed) return { kind: 'unavailable', diagnostic: 'the holder plugin has stopped' }
      switch (answer.kind) {
        case 'issued':
          this.held.set(key, [
            ...list.filter(item => item !== held),
            {
              principal: request.principal,
              eligibility: answer.eligibility.id,
              recovery: view.recovery,
              revision: view.revision,
            },
          ])
          return { kind: 'current', eligibility: answer.eligibility.id }
        case 'refused':
          switch (answer.reason) {
            case 'unauthorized':
              return { kind: 'refused' }
            case 'scope-ended':
              return { kind: 'absent' }
            case 'supersedes-unknown':
              if (supersedes === null)
                return { kind: 'unavailable', diagnostic: 'issueEligibility: supersedes-unknown' }
              supersedes = null
              continue
            case 'closed':
            case 'replay-incomplete':
              return { kind: 'unavailable', diagnostic: `issueEligibility: ${answer.reason}` }
            default: {
              const exhaustive: never = answer.reason
              return exhaustive
            }
          }
        case 'unavailable':
          return {
            kind: 'unavailable',
            diagnostic: `issueEligibility: unavailable (${answer.cause})`,
          }
        case 'unknown':
          return { kind: 'unknown' }
        default: {
          const exhaustive: never = answer
          return exhaustive
        }
      }
    }
  }
}

/**
 * The AD-03 plugins and the `replayFacts` port for `createSessionRuntimeContextTrust`. Mount both
 * plugins; each one stays `PENDING` while `runtimeContext` or `session` is absent. `replayFacts`
 * answers `unavailable` while the replay sub-plugin is not running.
 */
export function createSessionContextHolder<P>(input: SessionContextHolderInput<P>) {
  const shared: Shared<P> = {
    input,
    index: new Map(),
    link: { replay: undefined },
    recoveries: { next: 0 },
  }
  const replayFacts: SessionReplayFacts = {
    async stepCommittedBlocks(scope, through) {
      const fiber = shared.link.replay
      if (fiber === undefined) return { kind: 'unavailable' }
      try {
        return await fiber.stepCommittedBlocks(scope, through)
      } catch {
        return { kind: 'unavailable' }
      }
    },
  }
  return {
    /** `session-ad03`: the holder that provides `runtimeContextReaderEligibility`. */
    holder: {
      name: 'session-ad03',
      inject: {
        [runtimeContextKey]: null,
        [sessionKey]: { caller: 'coordinator' as const },
      },
      apply(ctx: Context) {
        new SessionReaderEligibilityProvider(ctx, shared)
      },
    },
    /** `session-ad03-replay`: the only caller of `applyCommit`. */
    replay: {
      name: 'session-ad03-replay',
      inject: {
        [runtimeContextKey]: null,
        [sessionKey]: { caller: 'reader' as const },
      },
      apply(ctx: Context) {
        startReplay(ctx, shared)
      },
    },
    replayFacts,
  }
}
