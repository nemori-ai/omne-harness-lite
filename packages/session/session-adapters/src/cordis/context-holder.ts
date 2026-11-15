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
const SCOPE_INDEX_ENTRIES = 4096
const SCOPE_MINTING_KINDS: readonly string[] = ['session.created', 'session.unarchived']
const PAGE_BYTES = 65536
const MAX_PAGES = 10000

export interface SessionContextTranslation {
  readonly kinds: readonly string[]
  commitOf(
    entry: HistoryEntry,
    session: Readonly<{ tenant: TenantId }>,
  ): Outcome<RecordedCommit | null, string>
}

export type SessionContextHolderInput<P> = Readonly<{
  coordinator(
    input: Readonly<{ tenant: TenantId; session: SessionId }>,
  ): Promise<Outcome<P, SessionCoordinatorPrincipalFailure>>
  translation: SessionContextTranslation
  registrationApplied?(
    input: Readonly<{
      tenant: TenantId
      session: SessionId
      scope: ScopeRef
      keys: readonly ContextBlockKey[]
      ended: boolean
    }>,
  ): Promise<void>
  scopeIndexEntries?: number
  pageBytes?: number
}>

type Bound = Readonly<{ tenant: TenantId; session: SessionId }>
type WithoutAfter<C> = C extends { readonly after: unknown } ? Omit<C, 'after'> : C

export type RecordedCommit = WithoutAfter<CommitInput>

type ContextRecord = Readonly<{ entry: HistoryEntry; input: RecordedCommit }>
type Registered = Readonly<{
  bindings: readonly NeedBinding[]
  checkpointed: boolean
}>

type Folded = Readonly<{
  material: ReplayMaterial
  final: ReadonlyMap<ContextBlockKey, Registered>
  stepCommitted: readonly ContextBlockKey[]
}>

type ScopeState =
  | Readonly<{ phase: 'failed'; replay: ReplayRef | null }>
  | Readonly<{
      phase: 'open' | 'ended'
      replay: ReplayRef
      recovery: number
      covered: ReadonlySet<string>
      final: ReadonlyMap<ContextBlockKey, Registered>
      revision: RegistrationRevision
    }>

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

type ScopesRead = (bound: Bound) => Promise<Outcome<readonly SessionContextScope[], string>>

type Known = Extract<SessionScopeLookupAnswer, { kind: 'known' }>

interface ReplayFiber {
  recoverSession(bound: Bound, scope: ScopeRef): Promise<ScopeView>
  ensure(scope: ScopeRef, tenant: TenantId): Promise<ScopeView>
}

interface FactsFiber extends SessionScopeLookup, SessionReplayFacts {}

type Shared<P> = Readonly<{
  input: SessionContextHolderInput<P>
  index: Map<string, Bound>
  known: Map<string, Known>
  link: { replay: ReplayFiber | undefined; facts: FactsFiber | undefined }
  recoveries: { next: number }
  learning: Set<Promise<void>>
  indexing: Map<string, Promise<Outcome<void, string>>>
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

function targetOf(input: RecordedCommit): Readonly<{ scope: ScopeRef; tenant: TenantId }> {
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

function chained(records: readonly ContextRecord[], index: number): CommitInput {
  const input = records[index]?.input
  if (input === undefined) throw new RangeError(`no record at ${index}`)
  if (input.kind === 'scope') return input
  return { ...input, after: records[index - 1]?.input.commit ?? null }
}

function endsScope(input: RecordedCommit): boolean {
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

function upTo(
  records: readonly ContextRecord[],
  through: CommitRef | null,
): readonly ContextRecord[] | undefined {
  if (through === null) return []
  for (let at = records.length - 1; at >= 0; at--)
    if (records[at]?.input.commit.commit === through.commit) return records.slice(0, at + 1)
  return undefined
}

type ScopeRecords = Readonly<{ scope: ScopeRef; records: readonly ContextRecord[] }>

type Read<P> =
  | Readonly<{ kind: 'read'; principal: P; scopes: ReadonlyMap<string, ScopeRecords> }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

type Logger = ReturnType<Context['logger']>

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

function setNewest<K, V>(map: Map<K, V>, key: K, value: V, limit: number): void {
  map.delete(key)
  map.set(key, value)
  while (map.size > limit) {
    const oldest = map.keys().next()
    if (oldest.done === true) break
    map.delete(oldest.value)
  }
}

function remember<P>(shared: Shared<P>, scope: string, bound: Bound): void {
  setNewest(shared.index, scope, bound, shared.input.scopeIndexEntries ?? SCOPE_INDEX_ENTRIES)
}

function sessionKeyOf(bound: Bound): string | undefined {
  const tenant = tenantText(bound.tenant)
  return tenant === undefined ? undefined : JSON.stringify([tenant, bound.session])
}

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

function recordReader<P>(
  ctx: Context,
  shared: Shared<P>,
  logger: Logger,
): (bound: Bound) => Promise<Read<P>> {
  const { input } = shared
  const pageBytes = input.pageBytes ?? PAGE_BYTES

  function groupByScope(
    entries: readonly HistoryEntry[],
    bound: Bound,
  ): Outcome<Map<string, { scope: ScopeRef; records: ContextRecord[] }>, string> {
    const scopes = new Map<string, { scope: ScopeRef; records: ContextRecord[] }>()
    for (const entry of entries) {
      let translated: Outcome<RecordedCommit | null, string>
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
  const readScopes = scopesReader(ctx, shared)
  const states = new Map<string, ScopeState>()
  const chains = new Map<string, Promise<void>>()
  let closed = false

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

  async function notifyRegistration(bound: Bound, scope: ScopeRef): Promise<void> {
    const state = states.get(scope.ref)
    if (closed || state === undefined || state.phase === 'failed') return
    try {
      await input.registrationApplied?.({
        ...bound,
        scope,
        keys: Object.freeze([...state.final.keys()]),
        ended: state.phase === 'ended',
      })
    } catch {
      logger.warn('registration applied notification failed')
    }
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
      await notifyRegistration(bound, scope)
    } catch (cause) {
      logger.warn(`the recovery of ${scope.ref} threw: ${describe(cause)}`)
      if (!closed) states.set(scope.ref, { phase: 'failed', replay: failedReplay })
    }
  }

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
          if (record.input.kind === 'registration' || endsScope(record.input))
            await notifyRegistration(bound, scope)
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
          return
        default: {
          const exhaustive: never = answer
          return exhaustive
        }
      }
    }
  }

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

  async function sync(bound: Bound): Promise<Synced> {
    const read = await readRecords(bound)
    if (read.kind === 'unavailable') return read
    return apply(read, bound)
  }

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

  async function locate(
    scope: ScopeRef,
    tenant: TenantId,
  ): Promise<Bound | Readonly<{ diagnostic: string }> | undefined> {
    await Promise.all([settled(), ...shared.learning])
    const found = index.get(scope.ref)
    if (found !== undefined) return found
    const failures: string[] = []
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
    async recoverSession(bound, scope) {
      if (closed) return STOPPED
      const key = sessionKeyOf(bound)
      if (key === undefined) return { kind: 'unavailable', diagnostic: 'unminted tenant' }
      const indexed = await indexScopes(shared, bound, key, readScopes, true)
      if ('failure' in indexed) return { kind: 'unavailable', diagnostic: indexed.failure }
      const owner = index.get(scope.ref)
      if (
        owner === undefined ||
        !tenantEquals(owner.tenant, bound.tenant) ||
        owner.session !== bound.session
      )
        return { kind: 'unseen' }
      return fiber.ensure(scope, bound.tenant)
    },
    async ensure(scope, tenant) {
      if (closed) return STOPPED
      let bound = index.get(scope.ref)
      if (bound === undefined) {
        const located = await locate(scope, tenant)
        if (located === undefined) return { kind: 'unseen' }
        if ('diagnostic' in located) return { kind: 'unavailable', diagnostic: located.diagnostic }
        bound = located
      }
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

const UNAVAILABLE = { kind: 'unavailable' } as const
const UNKNOWN = { kind: 'unknown' } as const

class SessionReplayFactsProvider extends SessionReplayFactsService {
  readonly stepCommittedBlocks: SessionReplayFacts['stepCommittedBlocks']
  constructor(scope: Context, fiber: FactsFiber) {
    super(scope)
    this.stepCommittedBlocks = (target, through) => fiber.stepCommittedBlocks(target, through)
  }
}

class SessionScopeLookupProvider extends SessionScopeLookupService {
  readonly lookup: SessionScopeLookup['lookup']
  constructor(scope: Context, fiber: FactsFiber) {
    super(scope)
    this.lookup = target => fiber.lookup(target)
  }
}

type HistoryLink<P> = {
  read: ((bound: Bound) => Promise<Read<P>>) | undefined
  scopes: ScopesRead | undefined
}

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
  const learning = shared.learning
  const scoped = new Map<string, true>()
  let closed = false

  async function learnRecords(bound: Bound): Promise<void> {
    const read = await readRecords(bound)
    if (read.kind === 'unavailable')
      logger.warn(`the scopes of a session were not indexed: ${read.diagnostic}`)
    else if (!closed) for (const ref of read.scopes.keys()) remember(shared, ref, bound)
  }

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
      const kept = shared.known.get(scope.ref)
      if (kept !== undefined) return kept
      let bound = index.get(scope.ref)
      if (bound === undefined) {
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
      learnKnown(shared, bound, scopes.ok)
      return shared.known.get(scope.ref) ?? UNKNOWN
    },
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

type Held = Readonly<{
  principal: unknown
  eligibility: EligibilityId
  recovery: number
  revision: RegistrationRevision
}>

function same(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null)
    return false
  if (Array.isArray(left) !== Array.isArray(right)) return false
  const a = Object.entries(left)
  const b = new Map<string, unknown>(Object.entries(right))
  return a.length === b.size && a.every(([name, value]) => b.has(name) && same(value, b.get(name)))
}

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
  const replayFacts: SessionReplayFacts = {
    stepCommittedBlocks: (scope, through) =>
      shared.link.facts?.stepCommittedBlocks(scope, through) ?? Promise.resolve(UNAVAILABLE),
  }
  return {
    async recoverSession(
      bound: Bound & Readonly<{ scope: ScopeRef }>,
    ): Promise<Readonly<{ kind: 'ready' | 'absent' | 'unavailable' }>> {
      const replay = shared.link.replay
      if (replay === undefined) return { kind: 'unavailable' }
      try {
        const result = await replay.recoverSession(bound, bound.scope)
        return {
          kind:
            result.kind === 'open' ? 'ready' : result.kind === 'ended' ? 'absent' : 'unavailable',
        }
      } catch {
        return { kind: 'unavailable' }
      }
    },
    holder: {
      name: 'session-ad03',
      inject: {
        [runtimeContextKey]: null,
        [sessionKey]: null,
      },
      apply(ctx: Context) {
        new SessionReaderEligibilityProvider(ctx, shared)
      },
    },
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
    facts: {
      name: 'session-ad03-facts',
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
