// AD-03, the Runtime Context holder of Session (SPEC AD-03, docs/cordis.md): three plugins, the
// `replayFacts` port of `createSessionRuntimeContextTrust` and the scope lookup (R2-D14, R2-D29).
//
// - The replay sub-plugin `session-ad03-replay` injects the holder face and `session` with the
//   `reader` caller class. It is the only caller of `applyCommit`. A `committed` notice whose kinds
//   can hold a context record makes it read the session's context records, in log order, and
//   translate each to the Runtime Context commit input it records. A scope it has not recovered in
//   this generation, and an `out-of-order` answer, start a recovery session (1a): `beginReplay`
//   at the scope's last commit, the complete material, `finishReplay`. Afterwards each new record
//   goes to `applyCommit` with its original commit and full input, in log order, naming the commit
//   of the scope's record before it as `after` (RC-02 提交链, R2-D319). Within one session the work
//   is serial, and only the first record not yet answered `applied` is sent again, so a recovered
//   instance keeps one success entry per scope.
// - The holder plugin `session-ad03` injects the holder face and `session` with the `coordinator`
//   caller class, and provides `runtimeContextReaderEligibility` (K-RC). Its policy: answer the
//   eligibility it issued for the same principal, consumer class and scope while the scope's
//   recovery and registration revision are unchanged; otherwise issue one on the spot from the
//   scope's final registrations, superseding the earlier one. It calls nothing on `session`: it
//   injects it, with no caller class, only to run while the replay sub-plugin can read.
// - The facts plugin `session-ad03-facts` injects `session` alone, with no caller class, so it runs
//   without Runtime Context and without the replay sub-plugin. Its history sub-plugin
//   `session-ad03-facts-history` makes all its reads as `reader`. It indexes the scopes that the
//   records of a session name, and the open scopes of the session, from the same `committed`
//   notices, and answers two questions from the session's own facts.
//   `replayFacts.stepCommittedBlocks` reads the records and folds them up to the checkpoint, so
//   C18's trust checks a finished recovery against the log, not against the material. The scope
//   lookup answers the tenant, session and generation of a scope from the session's own scope
//   bindings: the index only says where to look, the bindings decide. It names an owner and grants
//   nothing.
// - The scopes of a session (SCOPE-NARROW, R2-D229) are read without the work snapshot: the
//   entries of each kind of `CONTEXT_SCOPE_KINDS` (SE27, SE28) alone, which the kind index serves,
//   folded by session-contract's `contextScopesOf`. The session and generation of a scope never
//   change, so a `known` lookup answer is kept in the process and read no more. Whether a scope has
//   ended does change, so it is never kept: the recovery of a new scope with the empty material
//   reads the bindings afresh each time and goes ahead only while they show the scope open.
//
// The Session log is the authority. The plugins keep only derivatives: the scope-to-session index
// and the known lookup answers (maps of the process lifetime, bounded), the sessions whose scopes
// could not be indexed (bounded), the recovery state of each scope (one replay fiber), and the
// issued eligibilities
// (one holder fiber). The translation from a committed Session entry to a Runtime Context commit
// input is AD-12's translation protocol; the assembly hands it in as `translation`.
import type { Context } from '@deepseek-ai/cordis'
import { tenantCodec, tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
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
import {
  CONTEXT_SCOPE_KINDS,
  contextScopesOf,
  type HistoryEntry,
  type HistoryPage,
  type SessionAccess,
  type SessionContextScope,
  type SessionFailure,
  type SessionId,
} from '@omne-harness/session-contract'
import type {
  SessionReplayFacts,
  SessionScopeLookup,
  SessionScopeLookupAnswer,
} from '@omne-harness/session-cordis-contract'
import {
  SessionReplayFactsService,
  SessionScopeLookupService,
  sessionKey,
} from '@omne-harness/session-cordis-contract/cordis'
import type { SessionCoordinatorPrincipalFailure } from './agent-drive.ts'

const LOGGER = 'session-adapters/context-holder'
/** The initial bound of the scope-to-session index and the known lookup answers (IC-14). */
const SCOPE_INDEX_ENTRIES = 4096
/** The Session entry kinds whose batch mints a new context scope (session-contract J18). */
const SCOPE_MINTING_KINDS: readonly string[] = ['session.created', 'session.unarchived']
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
  /** `session` is the session whose log holds the entry: the end of a scope (SE27) takes its tenant. */
  commitOf(
    entry: HistoryEntry,
    session: Readonly<{ tenant: TenantId }>,
  ): Outcome<CommitInput | null, string>
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

/** The Context scopes of one session, read afresh as `reader`, or why they cannot be had. */
type ScopesRead = (bound: Bound) => Promise<Outcome<readonly SessionContextScope[], string>>

type Known = Extract<SessionScopeLookupAnswer, { kind: 'known' }>

/** The replay fiber as the holder plugin sees it. */
interface ReplayFiber {
  ensure(scope: ScopeRef, tenant: TenantId): Promise<ScopeView>
}

/** The facts fiber as the two facts services and `replayFacts` see it. It never throws. */
interface FactsFiber extends SessionScopeLookup, SessionReplayFacts {}

type Shared<P> = Readonly<{
  input: SessionContextHolderInput<P>
  /** scope text → its session; a derivative of Session's own records, kept across generations. */
  index: Map<string, Bound>
  /**
   * scope text → the lookup answer its session's bindings gave. Owner and generation never change,
   * so it is kept across generations, bounded like the index. Nothing about the end is kept.
   */
  known: Map<string, Known>
  link: { replay: ReplayFiber | undefined; facts: FactsFiber | undefined }
  recoveries: { next: number }
  /** The indexing reads of the facts plugin still running: a lookup waits for them before `unseen`. */
  learning: Set<Promise<void>>
  /** session key → the scope read that indexes its open scopes now, shared by every asker. */
  indexing: Map<string, Promise<Outcome<void, string>>>
  /**
   * session key → a session whose open scopes could not be indexed, and why. The holder reads its
   * scopes again on demand before it calls a scope unseen. Bounded like the index; the oldest goes
   * first.
   */
  unindexed: Map<string, Readonly<{ bound: Bound; diagnostic: string }>>
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

/**
 * The input sent for the record at `index` of a scope's records: an ordinary commit names the commit
 * of the record before it, `null` for the first (RC-02 提交链, R2-D319). The order is the log's.
 */
function chained(records: readonly ContextRecord[], index: number): CommitInput {
  const input = records[index]?.input
  if (input === undefined) throw new RangeError(`no record at ${index}`)
  if (input.kind === 'scope') return input
  return { ...input, after: records[index - 1]?.input.commit ?? null }
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

// --- the context records and the scope index -----------------------------------------------------

/** The records of one scope, in log order, with the scope as the first record names it. */
type ScopeRecords = Readonly<{ scope: ScopeRef; records: readonly ContextRecord[] }>

type Read<P> =
  | Readonly<{ kind: 'read'; principal: P; scopes: ReadonlyMap<string, ScopeRecords> }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

type Logger = ReturnType<Context['logger']>

/** The coordinator principal of the session, or why the assembly cannot give it. */
async function principalOf<P>(
  input: SessionContextHolderInput<P>,
  bound: Bound,
): Promise<Outcome<P, string>> {
  try {
    const answer = await input.coordinator(bound)
    return 'ok' in answer
      ? answer
      : fail(`the coordinator principal is not available: ${answer.failure.kind}`)
  } catch (cause) {
    return fail(`the coordinator principal source threw: ${describe(cause)}`)
  }
}

/** Sets a key newest last in a bounded map; the oldest goes when the bound is passed. */
function setNewest<K, V>(map: Map<K, V>, key: K, value: V, limit: number): void {
  map.delete(key)
  map.set(key, value)
  while (map.size > limit) {
    const oldest = map.keys().next()
    if (oldest.done === true) break
    map.delete(oldest.value)
  }
}

/** Notes the session of a scope in the index, newest last; the oldest goes when the bound is passed. */
function remember<P>(shared: Shared<P>, scope: string, bound: Bound): void {
  setNewest(shared.index, scope, bound, shared.input.scopeIndexEntries ?? SCOPE_INDEX_ENTRIES)
}

/** The key of one session in the per-session maps; `undefined` for a tenant that cannot be encoded. */
function sessionKeyOf(bound: Bound): string | undefined {
  const tenant = tenantText(bound.tenant)
  return tenant === undefined ? undefined : JSON.stringify([tenant, bound.session])
}

/** One page of a history read, or why the read cannot go on. */
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
 * Every history entry of the given kinds of one session, in log order, read with the `session` of
 * `ctx`, or why the read ended early.
 */
async function readEntries<P>(
  ctx: Context,
  access: SessionAccess<P>,
  kinds: readonly string[],
  pageBytes: number,
): Promise<Outcome<readonly HistoryEntry[], string>> {
  const entries: HistoryEntry[] = []
  let page = await pageOf(() =>
    ctx[sessionKey].history.begin({
      ...access,
      kinds,
      from: null,
      direction: 'forward',
      pageBytes,
    }),
  )
  for (let pages = 1; ; pages++) {
    if ('failure' in page) return page
    entries.push(...page.ok.entries)
    if (page.ok.exhausted) return succeed(entries)
    const cursor = page.ok.next
    if (cursor === null || pages >= MAX_PAGES)
      return fail('the history read ended before it was exhausted')
    page = await pageOf(() => ctx[sessionKey].history.next({ ...access, cursor }))
  }
}

/**
 * The scope read of a plugin that calls `session` as `reader`: the entries of each kind of
 * `CONTEXT_SCOPE_KINDS` alone (a read of one kind is served from the kind index, so its cost does
 * not grow with the history), folded by `contextScopesOf`. A binding that is not minted for the
 * session asked is not this session's, and fails the read. Nothing of it is kept here.
 */
function scopesReader<P>(ctx: Context, shared: Shared<P>): ScopesRead {
  const pageBytes = shared.input.pageBytes ?? PAGE_BYTES
  return async bound => {
    const principal = await principalOf(shared.input, bound)
    if ('failure' in principal) return principal
    const access = { principal: principal.ok, tenant: bound.tenant, session: bound.session }
    const entries: HistoryEntry[] = []
    for (const kind of CONTEXT_SCOPE_KINDS) {
      const read = await readEntries(ctx, access, [kind], pageBytes)
      if ('failure' in read) return read
      entries.push(...read.ok)
    }
    try {
      return contextScopesOf(bound, entries)
    } catch (cause) {
      return fail(`the scope bindings could not be folded: ${describe(cause)}`)
    }
  }
}

/** Keeps the lookup answers that one complete scope read of a session gives. */
function learnKnown<P>(shared: Shared<P>, bound: Bound, scopes: readonly SessionContextScope[]) {
  const limit = shared.input.scopeIndexEntries ?? SCOPE_INDEX_ENTRIES
  for (const { scope, generation } of scopes)
    setNewest(
      shared.known,
      scope,
      { kind: 'known', tenant: bound.tenant, session: bound.session, generation },
      limit,
    )
}

/**
 * Indexes the open scopes of one session (AD-03 1a: a new scope has no record yet). Askers of the
 * same session share the read in flight; `fresh` starts a new one, for a notice that minted a scope
 * after that read may have begun. A read that fails leaves the session in `unindexed` with its
 * reason, so the holder can read it again on demand.
 */
function indexScopes<P>(
  shared: Shared<P>,
  bound: Bound,
  key: string,
  read: ScopesRead,
  fresh: boolean,
): Promise<Outcome<void, string>> {
  const running = shared.indexing.get(key)
  if (running !== undefined && !fresh) return running
  const limit = shared.input.scopeIndexEntries ?? SCOPE_INDEX_ENTRIES
  const indexed = (async (): Promise<Outcome<void, string>> => {
    let scopes: Outcome<readonly SessionContextScope[], string>
    try {
      scopes = await read(bound)
    } catch (cause) {
      scopes = fail(`the scope read threw: ${describe(cause)}`)
    }
    if ('failure' in scopes) {
      setNewest(shared.unindexed, key, { bound, diagnostic: scopes.failure }, limit)
      return scopes
    }
    learnKnown(shared, bound, scopes.ok)
    for (const binding of scopes.ok)
      if (binding.ended === null) remember(shared, binding.scope, bound)
    shared.unindexed.delete(key)
    return succeed(undefined)
  })()
  shared.indexing.set(key, indexed)
  void indexed.finally(() => {
    if (shared.indexing.get(key) === indexed) shared.indexing.delete(key)
  })
  return indexed
}

/**
 * The read of the context records of one session, shared by the replay sub-plugin and the facts
 * plugin. Each plugin reads with its own `session` service, so the caller class of the read is the
 * caller class of that plugin.
 */
function recordReader<P>(
  ctx: Context,
  shared: Shared<P>,
  logger: Logger,
): (bound: Bound) => Promise<Read<P>> {
  const { input } = shared
  const pageBytes = input.pageBytes ?? PAGE_BYTES

  /** The records of the entries, grouped by scope; a translation defect or another tenant's record fails the whole. */
  function groupByScope(
    entries: readonly HistoryEntry[],
    bound: Bound,
  ): Outcome<Map<string, { scope: ScopeRef; records: ContextRecord[] }>, string> {
    const scopes = new Map<string, { scope: ScopeRef; records: ContextRecord[] }>()
    for (const entry of entries) {
      let translated: Outcome<CommitInput | null, string>
      try {
        translated = input.translation.commitOf(entry, { tenant: bound.tenant })
      } catch (cause) {
        translated = fail(`the translation threw: ${describe(cause)}`)
      }
      if ('failure' in translated) return fail(`entry ${entry.id}: ${translated.failure}`)
      const commit = translated.ok
      if (commit === null) continue
      const target = targetOf(commit)
      if (!tenantEquals(target.tenant, bound.tenant))
        return fail(`entry ${entry.id} names another tenant than its session`)
      const group = scopes.get(target.scope.ref) ?? { scope: target.scope, records: [] }
      group.records.push({ entry, input: commit })
      scopes.set(target.scope.ref, group)
    }
    return succeed(scopes)
  }

  /**
   * Every context record of one session, in log order, grouped by scope. A read that ends before it
   * is exhausted, a translation defect, and a record whose tenant is not the session's are not a
   * complete read: the answer is unavailable and nothing is indexed.
   */
  async function readRecords(bound: Bound): Promise<Read<P>> {
    const principal = await principalOf(input, bound)
    if ('failure' in principal) return { kind: 'unavailable', diagnostic: principal.failure }
    const access = { principal: principal.ok, tenant: bound.tenant, session: bound.session }
    const entries = await readEntries(ctx, access, input.translation.kinds, pageBytes)
    if ('failure' in entries) return { kind: 'unavailable', diagnostic: entries.failure }
    const scopes = groupByScope(entries.ok, bound)
    if ('failure' in scopes) return defect(scopes.failure)
    return { kind: 'read', principal: principal.ok, scopes: scopes.ok }
  }

  function defect(diagnostic: string): Read<P> {
    logger.error(`translation defect: ${diagnostic}`)
    return { kind: 'unavailable', diagnostic: `translation defect: ${diagnostic}` }
  }

  return readRecords
}

// --- the replay sub-plugin -----------------------------------------------------------------------

/** What one sync of a session did, as the holder's answer needs it. */
type Synced =
  | Readonly<{ kind: 'synced' }>
  | Readonly<{ kind: 'ended' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

const SYNCED = { kind: 'synced' } as const
const STOPPED = { kind: 'unavailable', diagnostic: 'the replay sub-plugin has stopped' } as const

function startReplay<P>(ctx: Context, shared: Shared<P>): void {
  const holder: RuntimeContextOperations<unknown> = ctx[runtimeContextKey]
  const logger = ctx.logger(LOGGER)
  const { index, input } = shared
  const readRecords = recordReader(ctx, shared, logger)
  // As `reader`, like the records: a plugin calls `session` with one caller class (AD-00 rule 1).
  const readScopes = scopesReader(ctx, shared)
  const states = new Map<string, ScopeState>()
  const chains = new Map<string, Promise<void>>()
  let closed = false

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
    for (const [index, record] of records.entries()) {
      const state = states.get(scope.ref)
      if (state === undefined || state.phase !== 'open') return
      if (state.covered.has(record.input.commit.commit)) continue
      let answer: Awaited<ReturnType<typeof holder.applyCommit>>
      try {
        answer = await holder.applyCommit(principal, chained(records, index))
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

  /** Brings every scope that the records of one complete read name up to date. */
  async function apply(read: Extract<Read<P>, { kind: 'read' }>, bound: Bound): Promise<Synced> {
    for (const [ref, { scope, records }] of read.scopes) {
      if (closed) return STOPPED
      remember(shared, ref, bound)
      const state = states.get(ref)
      if (state === undefined || state.phase === 'failed')
        await recover(read.principal, bound, scope, records, state)
      else if (state.phase === 'open') await catchUp(read.principal, bound, scope, records)
    }
    return SYNCED
  }

  /** Reads the session's records and brings every scope in them up to date. */
  async function sync(bound: Bound): Promise<Synced> {
    const read = await readRecords(bound)
    if (read.kind === 'unavailable') return read
    return apply(read, bound)
  }

  /**
   * `sync` for the scope that the holder asks about. A scope that the complete read holds no record
   * of is a new scope (AD-03 1a). The session's scope bindings, read afresh after the records and
   * never kept, decide whether it still is one: listed and not ended, it is recovered with the empty
   * material, which is complete because the read before was. Ended, it answers `ended` without a
   * recovery: the end record that the read did not hold reaches Runtime Context with the next read.
   * Not listed, or not readable, it is unavailable: the empty material is never taken for a scope
   * the session does not show open.
   */
  async function syncFor(bound: Bound, wanted: ScopeRef): Promise<Synced> {
    const read = await readRecords(bound)
    if (read.kind === 'unavailable') return read
    const applied = await apply(read, bound)
    if (applied.kind !== 'synced' || read.scopes.has(wanted.ref)) return applied
    const listed = await readScopes(bound)
    if (closed) return STOPPED
    if ('failure' in listed)
      return { kind: 'unavailable', diagnostic: `the session scopes: ${listed.failure}` }
    const binding = listed.ok.find(item => item.scope === wanted.ref)
    if (binding === undefined)
      return { kind: 'unavailable', diagnostic: 'the session does not list the scope' }
    if (binding.ended !== null) return { kind: 'ended' }
    const state = states.get(wanted.ref)
    if (state === undefined || state.phase === 'failed')
      await recover(read.principal, bound, wanted, [], state)
    return SYNCED
  }

  async function settled(): Promise<void> {
    await Promise.all(chains.values())
  }

  /**
   * The session of a scope that the index does not hold. Notices still in flight may index it;
   * then the sessions of the tenant whose scopes could not be indexed are read again. A read that
   * fails again is the answer: the scope may be one of that session's.
   */
  async function locate(
    scope: ScopeRef,
    tenant: TenantId,
  ): Promise<Bound | Readonly<{ diagnostic: string }> | undefined> {
    await Promise.all([settled(), ...shared.learning])
    const found = index.get(scope.ref)
    if (found !== undefined) return found
    const failures: string[] = []
    // A copy: a read that fails again moves its session to the end of the map.
    for (const [key, { bound }] of Array.from(shared.unindexed)) {
      if (!tenantEquals(bound.tenant, tenant)) continue
      const indexed = await indexScopes(shared, bound, key, readScopes, false)
      if ('failure' in indexed) failures.push(indexed.failure)
    }
    const after = index.get(scope.ref)
    if (after !== undefined || failures.length === 0) return after
    return {
      diagnostic: `the open scopes of a session could not be indexed: ${failures.join('; ')}`,
    }
  }

  /** The view of a scope from the recovery state this fiber holds. */
  function viewOf(scope: ScopeRef, bound: Bound): ScopeView {
    const state = states.get(scope.ref)
    if (closed) return STOPPED
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
  }

  const fiber: ReplayFiber = {
    async ensure(scope, tenant) {
      if (closed) return STOPPED
      let bound = index.get(scope.ref)
      if (bound === undefined) {
        const located = await locate(scope, tenant)
        if (located === undefined) return { kind: 'unseen' }
        if ('diagnostic' in located) return { kind: 'unavailable', diagnostic: located.diagnostic }
        bound = located
      }
      // The tenant is checked before anything of the session is read.
      if (!tenantEquals(bound.tenant, tenant)) return { kind: 'other-tenant' }
      const key = sessionKeyOf(bound)
      if (key === undefined) return { kind: 'unavailable', diagnostic: 'unminted tenant' }
      const known = states.get(scope.ref)
      if (known === undefined || known.phase === 'failed') {
        const target = bound
        const result = await serialize(key, () => syncFor(target, scope))
        if (result.kind !== 'synced') return result
      }
      return viewOf(scope, bound)
    },
  }

  ctx.on('session-cordis-contract/committed', (tenant, session, _revision, _source, kinds) => {
    if (closed || !kinds.some(kind => input.translation.kinds.includes(kind))) return
    const bound = { tenant, session }
    const key = sessionKeyOf(bound)
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

// --- the facts plugin ----------------------------------------------------------------------------

const UNAVAILABLE = { kind: 'unavailable' } as const
const UNKNOWN = { kind: 'unknown' } as const

/** `sessionReplayFacts`: the trusted entry of Runtime Context reads it per call (R2-D29). */
class SessionReplayFactsProvider extends SessionReplayFactsService {
  readonly stepCommittedBlocks: SessionReplayFacts['stepCommittedBlocks']
  constructor(scope: Context, fiber: FactsFiber) {
    super(scope)
    this.stepCommittedBlocks = (target, through) => fiber.stepCommittedBlocks(target, through)
  }
}

/** `sessionScopeLookup`: answers the owner of a scope and grants nothing (R2-D14, R2-D29). */
class SessionScopeLookupProvider extends SessionScopeLookupService {
  readonly lookup: SessionScopeLookup['lookup']
  constructor(scope: Context, fiber: FactsFiber) {
    super(scope)
    this.lookup = target => fiber.lookup(target)
  }
}

/** Where the history sub-plugin of the current generation leaves its two readers. */
type HistoryLink<P> = {
  read: ((bound: Bound) => Promise<Read<P>>) | undefined
  scopes: ScopesRead | undefined
}

/**
 * `session-ad03-facts-history`: the history face admits the `reader` class only, and a plugin calls
 * `session` with one caller class (AD-00 rule 1). The facts plugin reads the context records and
 * the scope bindings through this sub-plugin.
 */
function createFactsHistoryPlugin<P>(shared: Shared<P>, link: HistoryLink<P>) {
  return {
    name: 'session-ad03-facts-history',
    inject: { [sessionKey]: { caller: 'reader' as const } },
    apply(sub: Context) {
      const read = recordReader(sub, shared, sub.logger(LOGGER))
      const scopes = scopesReader(sub, shared)
      link.read = read
      link.scopes = scopes
      sub.effect(() => () => {
        if (link.read === read) link.read = undefined
        if (link.scopes === scopes) link.scopes = undefined
      })
    },
  }
}

/**
 * `session-ad03-facts` depends on `session` alone, so it runs without Runtime Context and without
 * the replay sub-plugin. It keeps the scope-to-session index from the committed notices and answers
 * two questions from the session's own durable facts: which session a scope belongs to, and which
 * checkpointed blocks have a step commit.
 */
async function startFacts<P>(ctx: Context, shared: Shared<P>): Promise<void> {
  const logger = ctx.logger(LOGGER)
  const { index, input } = shared
  const history: HistoryLink<P> = { read: undefined, scopes: undefined }
  const NOT_RUNNING = 'the history sub-plugin of the facts plugin is not running'
  const readRecords = (bound: Bound): Promise<Read<P>> =>
    history.read?.(bound) ?? Promise.resolve({ kind: 'unavailable', diagnostic: NOT_RUNNING })
  const readScopes: ScopesRead = async bound => {
    const answer = await (history.scopes?.(bound) ?? Promise.resolve(fail(NOT_RUNNING)))
    return closed ? fail('the facts plugin has stopped') : answer
  }
  /** The notices whose read has not ended: a lookup waits for them before it says `unknown`. */
  const learning = shared.learning
  /**
   * The sessions whose scopes this generation has indexed, oldest first, bounded like the index. A
   * notice of a session not in it reads the scopes once: the kinds of a notice do not always name
   * the creation (a large entry can fall outside the notice's page).
   */
  const scoped = new Map<string, true>()
  let closed = false

  /** Indexes the scopes that the context records of one session name. A read that fails indexes nothing. */
  async function learnRecords(bound: Bound): Promise<void> {
    const read = await readRecords(bound)
    if (read.kind === 'unavailable')
      logger.warn(`the scopes of a session were not indexed: ${read.diagnostic}`)
    else if (!closed) for (const ref of read.scopes.keys()) remember(shared, ref, bound)
  }

  /**
   * Indexes the open scopes of the session: a new scope has no record yet, and the holder must still
   * find it (AD-03 1a). Concurrent first notices of a session share one read: a session has no
   * notice before its creation, so a read in flight already sees the scope it minted. A notice that
   * mints a scope later (unarchiving) reads afresh.
   */
  async function learnScopes(bound: Bound, key: string, minted: boolean): Promise<void> {
    const indexed = await indexScopes(shared, bound, key, readScopes, minted)
    if ('failure' in indexed) {
      logger.warn(`the open scopes of a session were not indexed: ${indexed.failure}`)
      return
    }
    setNewest(scoped, key, true, input.scopeIndexEntries ?? SCOPE_INDEX_ENTRIES)
  }

  const answers: FactsFiber = {
    async lookup(scope) {
      if (closed) return UNAVAILABLE
      // Owner and generation never change: an answer the bindings gave once is the answer.
      const kept = shared.known.get(scope.ref)
      if (kept !== undefined) return kept
      let bound = index.get(scope.ref)
      if (bound === undefined) {
        // A notice in flight may be about to index the scope.
        await Promise.all(learning)
        bound = index.get(scope.ref)
      }
      if (closed) return UNAVAILABLE
      if (bound === undefined) return UNKNOWN
      const scopes = await readScopes(bound)
      if (closed) return UNAVAILABLE
      if ('failure' in scopes) {
        logger.warn(`the scope lookup: ${scopes.failure}`)
        return UNAVAILABLE
      }
      // The index only says where to look. The bindings are the fact: a scope that they do not list
      // is not this session's (and is not kept: it is no answer), and the generation is the one they
      // record for that scope.
      learnKnown(shared, bound, scopes.ok)
      return shared.known.get(scope.ref) ?? UNKNOWN
    },
    // Reads the records itself, outside any replay: a recovery that finishes asks these facts.
    async stepCommittedBlocks(scope, through) {
      if (closed) return UNAVAILABLE
      const bound = index.get(scope.ref)
      if (bound === undefined) return UNAVAILABLE
      const read = await readRecords(bound)
      if (read.kind === 'unavailable' || closed) return UNAVAILABLE
      const records = upTo(read.scopes.get(scope.ref)?.records ?? [], through)
      if (records === undefined) return UNKNOWN
      return { kind: 'known', keys: fold(records).stepCommitted }
    },
  }
  // A read that throws is not an answer: both facts say `unavailable`.
  const fiber: FactsFiber = {
    lookup: async scope => {
      try {
        return await answers.lookup(scope)
      } catch {
        return UNAVAILABLE
      }
    },
    stepCommittedBlocks: async (scope, through) => {
      try {
        return await answers.stepCommittedBlocks(scope, through)
      } catch {
        return UNAVAILABLE
      }
    },
  }

  new SessionReplayFactsProvider(ctx, fiber)
  new SessionScopeLookupProvider(ctx, fiber)

  ctx.on('session-cordis-contract/committed', (tenant, session, _revision, _source, kinds) => {
    if (closed) return
    const bound = { tenant, session }
    const key = sessionKeyOf(bound)
    const minted = kinds.some(kind => SCOPE_MINTING_KINDS.includes(kind))
    const recorded = kinds.some(kind => input.translation.kinds.includes(kind))
    const scoping = key !== undefined && (minted || !scoped.has(key))
    if (!recorded && !scoping) return
    const work = Promise.all([
      recorded ? learnRecords(bound) : undefined,
      key !== undefined && scoping ? learnScopes(bound, key, minted) : undefined,
    ]).then(
      () => undefined,
      cause => logger.warn(`the scopes of a session were not indexed: ${describe(cause)}`),
    )
    learning.add(work)
    void work.finally(() => learning.delete(work))
    return work
  })
  ctx.effect(() => {
    shared.link.facts = fiber
    return () => {
      closed = true
      if (shared.link.facts === fiber) shared.link.facts = undefined
    }
  })
  await ctx.plugin(createFactsHistoryPlugin(shared, history))
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

    // An empty key set is issued too: the reader then reads the empty snapshot. `absent` stays the
    // answer of a scope that has no eligibility to give, so a missing one is never read as empty.
    const readable = readableBy(view.final, request.consumer)
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
 * The AD-03 plugins and the `replayFacts` port for `createSessionRuntimeContextTrust`. Mount the
 * three plugins. `holder` and `replay` stay `PENDING` while `runtimeContext` or `session` is
 * absent; `facts` needs `session` alone and provides `sessionReplayFacts` and `sessionScopeLookup`.
 * `replayFacts` answers `unavailable` while the facts plugin is not running.
 */
export function createSessionContextHolder<P>(input: SessionContextHolderInput<P>) {
  const shared: Shared<P> = {
    input,
    index: new Map(),
    known: new Map(),
    link: { replay: undefined, facts: undefined },
    recoveries: { next: 0 },
    learning: new Set(),
    indexing: new Map(),
    unindexed: new Map(),
  }
  // The same facts as the `sessionReplayFacts` service, for a caller that holds this value.
  const replayFacts: SessionReplayFacts = {
    stepCommittedBlocks: (scope, through) =>
      shared.link.facts?.stepCommittedBlocks(scope, through) ?? Promise.resolve(UNAVAILABLE),
  }
  return {
    /** `session-ad03`: the holder that provides `runtimeContextReaderEligibility`. */
    holder: {
      name: 'session-ad03',
      // `session` with no caller class: the holder calls nothing on it; the injection only makes
      // the holder run while `session` runs, as the replay sub-plugin does.
      inject: {
        [runtimeContextKey]: null,
        [sessionKey]: null,
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
    /** `session-ad03-facts`: provides `sessionReplayFacts` and `sessionScopeLookup`; it needs `session` alone. */
    facts: {
      name: 'session-ad03-facts',
      // No caller class: every read of the facts plugin goes through its `reader` history sub-plugin.
      inject: {
        [sessionKey]: null,
      },
      async apply(ctx: Context) {
        await startFacts(ctx, shared)
      },
    },
    replayFacts,
  }
}
