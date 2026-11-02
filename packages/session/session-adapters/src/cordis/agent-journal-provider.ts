// The plugin of the session-log Journal provider (assembly page row `agent-journal`): one plugin
// body serves `agentJournal`, `agentJournalEntries` and `agentMaterials` over one session-log
// Journal, so the three are in one authoritative ordering (agent-cordis-contract SPEC
// "生产者接收面的服务"). An AgentJournal or entries call names a tenant and an execution, not a
// session; the records live per session. Session wrote the execution of every Run into the execution index of session-storage-sql
// in the same commit as its SE13, so the plugin reads the session of a call there, by tenant and
// execution, and hands the call to `createSessionLogJournal(...).forSession` of that session
// (L-RUN decision w1-c19-q1). The relation never changes once committed: the plugin keeps it in a
// bounded in-process cache, a disposable derivative that a new instance rebuilds from storage.
//
// An execution that no Run of the tenant started, and an execution of another tenant, get the same
// answer: `denied` with the name of the operation, as the core answers for an execution it does
// not hold (Agent SPEC "判定次序与失败映射" 1). Nothing is written for either. A lookup that
// cannot be read is `unavailable`, never `denied`: a failed read does not prove absence.
//
// A material source that this provider made names its session (`materialSessionOf`), so
// `materials.read` goes to that session of the caller's tenant. A `materials.preserve` that names an
// execution is routed as a Journal call is and saved in the session of that execution. One that
// names none names no session, and the storage has no index from its consumer to a session, so it
// answers `unavailable` and writes nothing (session-adapters SPEC, known limitation K-9, for the
// compatibility period).
//
// After each successful write call the provider hands the tenant, the session and the execution to
// the `published` callback of its options. The plugin turns that into the event
// `session-adapters/agent-published`: a wake-up only, which carries no fact, so a subscriber reads
// the log itself (AD-02 trigger).
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type {
  AgentExecutionId,
  AgentJournal,
  AgentJournalEntries,
  AgentMaterials,
  Failure,
} from '@omne-harness/agent-contract'
import {
  AgentJournalEntriesService,
  AgentJournalService,
  AgentMaterialsService,
} from '@omne-harness/agent-cordis-contract/cordis'
import type { ContentBlock } from '@omne-harness/content-block'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { SessionAccessCheck, SessionId } from '@omne-harness/session-contract'
import { sessionAccessCheckKey } from '@omne-harness/session-cordis-contract/cordis'
import {
  SESSION_EXECUTION_HANDLER,
  SESSION_PROTOCOL,
  decodeSessionExecution,
} from '@omne-harness/session-storage-sql/participants'
import type { SqlStorage, TenantDomainLookup } from '@omne-harness/sql-contract'
import { storageKey, tenantDomainLookupKey } from '@omne-harness/sql-contract/cordis'
import type { JournalCombination } from '../journal-commit.ts'
import {
  createSessionLogJournal,
  materialSessionOf,
  type SessionLogJournalOptions,
  type SessionLogJournalProvider,
} from './agent-journal.ts'

const OWNER = 'session-log-journal'
const LOGGER = 'session-adapters/agent-journal'
/** The event that names the tenant, the session and the execution of each successful write. */
const PUBLISHED = 'session-adapters/agent-published'
/** The initial bound of the route cache; the assembly may set another (IC-14). */
const ROUTE_CACHE_ENTRIES = 4096

export type ExecutionRoutedJournalOptions<P> = Readonly<{
  storage: SqlStorage
  /** The trusted lookup of the tenant's transaction domain; it never registers a tenant. */
  tenantDomainLookup: TenantDomainLookup
  sessionAccessCheck: SessionAccessCheck<P>
  combination: JournalCombination
  /** The most execution routes the in-process cache keeps; the oldest goes first. */
  routeCacheEntries?: number
  /**
   * The trusted cancellation installation the Journal of every session holds, handed to the
   * session-log Journal as it is (R2-D35). Absent: the cancellation variants answer `unavailable`.
   */
  cancellation?: SessionLogJournalOptions<P>['cancellation']
  /**
   * Called once after each successful write call, with the session its route names. A wake-up
   * only; a throw is swallowed and the call keeps its answer.
   */
  published?: (tenant: TenantId, session: SessionId, execution: AgentExecutionId) => void
}>

type Journal<P> = AgentJournal<P>
type Materials<P> = AgentMaterials<P, ContentBlock>
/** The faces of one session's Journal: Journal, entries, materials and received commits. */
type SessionView<P> = SessionLogJournalProvider<P>
type Scope = Readonly<{ tenant: TenantId; execution: AgentExecutionId }>
/** The session that started an execution, and the faces of its Journal. */
type Route<P> = Readonly<{ session: SessionId; view: SessionView<P> }>

const unavailable = (diagnostic: string): Failure => ({
  kind: 'unavailable',
  owner: OWNER,
  diagnostic,
})

/**
 * The AgentJournal, AgentJournalEntries and AgentMaterials of every session of the storage, over
 * one session-log Journal: Journal and entries calls are routed by tenant and execution, a material
 * read by the session its source names. `close` makes every later call, also through a reference
 * held from before, answer `unavailable`.
 */
export function createExecutionRoutedJournal<P>(options: ExecutionRoutedJournalOptions<P>) {
  const journals = createSessionLogJournal<P>({
    storage: options.storage,
    tenantDomainLookup: options.tenantDomainLookup,
    sessionAccessCheck: options.sessionAccessCheck,
    combination: options.combination,
    ...(options.cancellation === undefined ? {} : { cancellation: options.cancellation }),
  })
  const limit = options.routeCacheEntries ?? ROUTE_CACHE_ENTRIES
  const routes = new Map<string, Route<P>>()
  let closed = false

  function remember(key: string, route: Route<P>): void {
    routes.delete(key)
    routes.set(key, route)
    while (routes.size > limit) {
      const oldest = routes.keys().next().value
      if (oldest === undefined) break
      routes.delete(oldest)
    }
  }

  /** The route to the session that started `scope.execution`, or the failure the call answers. */
  async function routeOf(scope: Scope, action: string): Promise<Outcome<Route<P>, Failure>> {
    if (closed) return fail(unavailable('the agentJournal plugin has stopped'))
    const tenant = tenantCodec.encode(scope.tenant)
    if (!tenant.ok) return fail({ kind: 'denied', action })
    const key = JSON.stringify([tenant.value, scope.execution])
    const cached = routes.get(key)
    if (cached !== undefined) return succeed(cached)

    let found
    try {
      found = await options.tenantDomainLookup.lookup({ tenant: tenant.value })
    } catch (error) {
      return fail(unavailable(`tenant domain lookup threw: ${String(error)}`))
    }
    // An unregistered tenant is not registered here, the same as the session-log Journal does.
    if (found.kind !== 'ready')
      return fail(
        unavailable(
          found.kind === 'unregistered' ? 'the tenant has no transaction domain' : found.diagnostic,
        ),
      )
    let result
    try {
      result = await options.storage.read({
        domain: found.domain,
        handler: SESSION_EXECUTION_HANDLER,
        protocol: SESSION_PROTOCOL,
        requestKey: randomUUID(),
        input: { tenant: tenant.value, execution: scope.execution },
      })
    } catch (error) {
      return fail(unavailable(`the execution index read threw: ${String(error)}`))
    }
    if (result.kind !== 'read') return fail(unavailable('the execution index is not readable'))
    const indexed = decodeSessionExecution(result.output)
    if (indexed === 'malformed') return fail(unavailable('the execution index row is malformed'))
    if (indexed === null) return fail({ kind: 'denied', action })
    const session = indexed.session as SessionId
    const route = { session, view: journals.forSession({ tenant: scope.tenant, session }) }
    remember(key, route)
    return succeed(route)
  }

  /** The faces of the session that started `scope.execution`, or the failure the call answers. */
  async function viewOf(scope: Scope, action: string): Promise<Outcome<SessionView<P>, Failure>> {
    const found = await routeOf(scope, action)
    return 'failure' in found ? fail<Failure>(found.failure) : succeed(found.ok.view)
  }

  /** Names a successful write to `published`; nothing it does reaches the answer of the call. */
  function announce(scope: Scope, session: SessionId): void {
    if (closed || options.published === undefined) return
    try {
      options.published(scope.tenant, session, scope.execution)
    } catch {
      // A wake-up that cannot be delivered does not undo the write; the plugin logs its own faults.
    }
  }

  /** One call: route it, then hand it to its session unchanged. */
  function routedView<A>(
    action: string,
    scope: Scope,
    call: (view: SessionView<P>) => Promise<Outcome<A, Failure>>,
  ): Promise<Outcome<A, Failure>> {
    return viewOf(scope, action).then(found =>
      'failure' in found ? fail<Failure>(found.failure) : call(found.ok),
    )
  }

  /** One write call: as `routedView`, and a successful answer is named to `published` once. */
  async function routedWrite<A>(
    action: string,
    scope: Scope,
    call: (view: SessionView<P>) => Promise<Outcome<A, Failure>>,
  ): Promise<Outcome<A, Failure>> {
    const found = await routeOf(scope, action)
    if ('failure' in found) return fail<Failure>(found.failure)
    const answered = await call(found.ok.view)
    if ('ok' in answered) announce(scope, found.ok.session)
    return answered
  }

  /** One Journal read: route it, then hand it to the Journal of its session unchanged. */
  function routed<A>(
    action: string,
    scope: Scope,
    call: (journal: Journal<P>) => Promise<Outcome<A, Failure>>,
  ): Promise<Outcome<A, Failure>> {
    return routedView(action, scope, view => call(view.journal))
  }

  /** One Journal write: as `routed`, and a successful answer is named to `published`. */
  function written<A>(
    action: string,
    scope: Scope,
    call: (journal: Journal<P>) => Promise<Outcome<A, Failure>>,
  ): Promise<Outcome<A, Failure>> {
    return routedWrite(action, scope, view => call(view.journal))
  }

  const journal: Journal<P> = {
    capabilities: {
      coordination: 'coordinated',
      participants: new Set(['message', 'context-transition', 'custody', 'processed']),
    },
    open: input => written('open', input, j => j.open(input)),
    attach: input => written('attach', input, j => j.attach(input)),
    detach: input => written('detach', input, j => j.detach(input)),
    commit: input => written('commit', input, j => j.commit(input)),
    submit: input => written('submit', input, j => j.submit(input)),
    control: input => written('control', input, j => j.control(input)),
    acknowledge: input => written('acknowledge', input, j => j.acknowledge(input)),
    recordResult: input => written('recordResult', input, j => j.recordResult(input)),
    recordControl: input => written('recordControl', input, j => j.recordControl(input)),
    recordHandoff: input => written('recordHandoff', input, j => j.recordHandoff(input)),
    prepareFinish: input => routed('prepareFinish', input, j => j.prepareFinish(input)),
    tryFinish: input => written('tryFinish', input, j => j.tryFinish(input)),
    commitSettlement: input => written('commitSettlement', input, j => j.commitSettlement(input)),
    recordTerminalObservation: input =>
      written('recordTerminalObservation', input, j => j.recordTerminalObservation(input)),
    load: input => routed('load', input, j => j.load(input)),
    inputs: input => routed('inputs', input, j => j.inputs(input)),
    readReplyAdmissions: input =>
      routed('readReplyAdmissions', input, j => j.readReplyAdmissions(input)),
    query: input => routed('query', input, j => j.query(input)),
    output: {
      // The action names are the ones the core answers for an execution it does not hold.
      read: input => routed('read', input, j => j.output.read(input)),
      async *events(input) {
        const found = await viewOf(input, 'events')
        if ('failure' in found) {
          yield fail<Failure>(found.failure)
          return
        }
        yield* found.ok.journal.output.events(input)
      },
    },
  }

  const entries: AgentJournalEntries<P> = {
    record: input => routedWrite('record', input, view => view.entries.record(input)),
  }

  const stopped = () => fail<Failure>(unavailable('the agentJournal plugin has stopped'))
  const materials: Materials<P> = {
    preserve(input) {
      if (closed) return Promise.resolve(stopped())
      // Without an execution the call names no session (K-9), and nothing is guessed.
      const { execution, ...material } = input
      if (execution === undefined)
        return Promise.resolve(
          fail<Failure>(unavailable('a material to preserve names no session: no route to one')),
        )
      // The route has chosen the session, so the call goes on without the execution: the session
      // Journal does not read it for a material, and its write path would take a call that names an
      // execution for a write of that execution's records, and never settle it.
      return routedView('preserve', { tenant: input.tenant, execution }, view =>
        view.materials.preserve(material),
      )
    },
    async read(input) {
      if (closed) return stopped()
      const tenant = tenantCodec.encode(input.tenant)
      if (!tenant.ok) return fail({ kind: 'denied', action: 'materials.read' })
      const named = materialSessionOf(input.source)
      // Another tenant's material is unreadable to this caller, as the session's own read answers.
      if (named === null || named.tenant !== tenant.value)
        return fail(unavailable('the material source names no session of this tenant'))
      return journals
        .forSession({ tenant: input.tenant, session: named.session })
        .materials.read(input)
    },
  }

  return {
    journal,
    entries,
    materials,
    close(): void {
      closed = true
      routes.clear()
    },
  }
}

/** The plugin configuration: the declared Session log combination and the route cache bound. */
export type AgentJournalProviderConfig = Readonly<{
  combinationVersion: string
  manifestDigest: string
  routeCacheEntries?: number
}>

type Issue = Readonly<{ message: string; path: readonly string[] }>

function parseConfig(
  value: unknown,
): Readonly<{ value: AgentJournalProviderConfig }> | Readonly<{ issues: readonly Issue[] }> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return { issues: [{ message: 'the configuration must be an object', path: [] }] }
  const { combinationVersion, manifestDigest, routeCacheEntries } = value as Record<string, unknown>
  const issues: Issue[] = []
  if (typeof combinationVersion !== 'string' || combinationVersion === '')
    issues.push({ message: 'a non-empty string', path: ['combinationVersion'] })
  if (typeof manifestDigest !== 'string' || !/^[0-9a-f]{64}$/.test(manifestDigest))
    issues.push({ message: 'a lowercase hex SHA-256', path: ['manifestDigest'] })
  if (
    routeCacheEntries !== undefined &&
    (typeof routeCacheEntries !== 'number' ||
      !Number.isSafeInteger(routeCacheEntries) ||
      routeCacheEntries < 1)
  )
    issues.push({ message: 'a positive integer', path: ['routeCacheEntries'] })
  if (issues.length > 0) return { issues }
  return {
    value: {
      combinationVersion: combinationVersion as string,
      manifestDigest: manifestDigest as string,
      ...(routeCacheEntries === undefined
        ? {}
        : { routeCacheEntries: routeCacheEntries as number }),
    },
  }
}

const configSchema = {
  '~standard': {
    version: 1 as const,
    vendor: 'session-adapters',
    validate: parseConfig,
  },
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * A write call of the session-log Journal answered successfully. The sender dispatches after
     * the write and does not wait for listeners; a listener that fails does not change the answer.
     * It is a wake-up only, not a source of fact: a subscriber reads the log itself, and a missed
     * event is recovered by its own scan.
     *
     * @mode parallel
     * @param tenant - the tenant that owns the session.
     * @param session - the session whose log the call wrote.
     * @param execution - the execution the call named.
     */
    'session-adapters/agent-published'(
      tenant: TenantId,
      session: SessionId,
      execution: AgentExecutionId,
    ): void
  }
}

/** `agentJournalEntries`, made by the body of `SessionLogAgentJournalProvider`. */
class SessionLogJournalEntries extends AgentJournalEntriesService<unknown> {
  readonly record: AgentJournalEntries<unknown>['record']

  constructor(ctx: Context, entries: AgentJournalEntries<unknown>) {
    super(ctx)
    this.record = entries.record
  }
}

/** `agentMaterials`, made by the body of `SessionLogAgentJournalProvider`. */
class SessionLogMaterials extends AgentMaterialsService<unknown, ContentBlock> {
  readonly preserve: Materials<unknown>['preserve']
  readonly read: Materials<unknown>['read']

  constructor(ctx: Context, materials: Materials<unknown>) {
    super(ctx)
    this.preserve = materials.preserve
    this.read = materials.read
  }
}

/**
 * The provider of `agentJournal`, `agentJournalEntries` and `agentMaterials`: the three services
 * are made in this one plugin body over one session-log Journal, so they come and go together. It
 * needs `storage`, the trusted `tenantDomainLookup` and `sessionAccessCheck`; with any of them
 * absent the plugin stays pending and provides none of the keys. A new provider of any of them
 * unloads the plugin and runs it again with an empty route cache. Stopping makes every call, also
 * through a reference held from before, answer `unavailable`. After each successful write call it
 * dispatches `session-adapters/agent-published` (tenant, session, execution), a wake-up only.
 * Loaded by itself it holds no cancellation installation, so a cancelled settlement answers
 * `unavailable`; the assembly entry supplies the installation through
 * `createSessionAgentJournalPlugin` (R2-D35), and the plugin configuration does not carry it.
 */
export class SessionLogAgentJournalProvider extends AgentJournalService<unknown> {
  static readonly inject = [storageKey, tenantDomainLookupKey, sessionAccessCheckKey]
  static readonly Config = configSchema

  readonly capabilities: AgentJournal<unknown>['capabilities']
  readonly open: AgentJournal<unknown>['open']
  readonly attach: AgentJournal<unknown>['attach']
  readonly detach: AgentJournal<unknown>['detach']
  readonly commit: AgentJournal<unknown>['commit']
  readonly submit: AgentJournal<unknown>['submit']
  readonly control: AgentJournal<unknown>['control']
  readonly acknowledge: AgentJournal<unknown>['acknowledge']
  readonly recordResult: AgentJournal<unknown>['recordResult']
  readonly recordControl: AgentJournal<unknown>['recordControl']
  readonly recordHandoff: AgentJournal<unknown>['recordHandoff']
  readonly prepareFinish: AgentJournal<unknown>['prepareFinish']
  readonly tryFinish: AgentJournal<unknown>['tryFinish']
  readonly commitSettlement: AgentJournal<unknown>['commitSettlement']
  readonly recordTerminalObservation: AgentJournal<unknown>['recordTerminalObservation']
  readonly load: AgentJournal<unknown>['load']
  readonly inputs: AgentJournal<unknown>['inputs']
  readonly readReplyAdmissions: AgentJournal<unknown>['readReplyAdmissions']
  readonly query: AgentJournal<unknown>['query']
  readonly output: AgentJournal<unknown>['output']

  /** `cancellation` is the trusted installation of R2-D35; only the plugin factory hands it in. */
  constructor(
    ctx: Context,
    config: AgentJournalProviderConfig,
    cancellation?: SessionLogJournalOptions<unknown>['cancellation'],
  ) {
    super(ctx)
    const logger = ctx.logger(LOGGER)
    const routed = createExecutionRoutedJournal<unknown>({
      published: (tenant, session, execution) => {
        try {
          // Not awaited: the write does not wait for listeners. A failure is logged here.
          ctx.parallel(PUBLISHED, tenant, session, execution).catch((error: unknown) => {
            logger.warn(`a listener of ${PUBLISHED} failed: ${String(error)}`)
          })
        } catch (error) {
          logger.warn(`dispatching ${PUBLISHED} failed: ${String(error)}`)
        }
      },
      storage: ctx.storage,
      tenantDomainLookup: ctx.tenantDomainLookup,
      sessionAccessCheck: ctx.sessionAccessCheck,
      combination: {
        combinationVersion: config.combinationVersion,
        manifestDigest: config.manifestDigest,
      },
      ...(config.routeCacheEntries === undefined
        ? {}
        : { routeCacheEntries: config.routeCacheEntries }),
      ...(cancellation === undefined ? {} : { cancellation }),
    })
    const journal = routed.journal
    this.capabilities = journal.capabilities
    this.open = journal.open
    this.attach = journal.attach
    this.detach = journal.detach
    this.commit = journal.commit
    this.submit = journal.submit
    this.control = journal.control
    this.acknowledge = journal.acknowledge
    this.recordResult = journal.recordResult
    this.recordControl = journal.recordControl
    this.recordHandoff = journal.recordHandoff
    this.prepareFinish = journal.prepareFinish
    this.tryFinish = journal.tryFinish
    this.commitSettlement = journal.commitSettlement
    this.recordTerminalObservation = journal.recordTerminalObservation
    this.load = journal.load
    this.inputs = journal.inputs
    this.readReplyAdmissions = journal.readReplyAdmissions
    this.query = journal.query
    this.output = journal.output
    new SessionLogJournalEntries(ctx, routed.entries)
    new SessionLogMaterials(ctx, routed.materials)
    ctx.effect(() => () => routed.close())
  }
}

/** What the assembly entry hands to `createSessionAgentJournalPlugin`. */
export type SessionAgentJournalPluginInput = Readonly<{
  /**
   * The trusted cancellation installation of the Journal of every session: the record and the
   * judging implementation (R2-D35). It is a function holder, so it is not a configuration member.
   * Absent: the cancellation variants answer `unavailable`, as with the plain provider.
   */
  cancellation?: SessionLogJournalOptions<unknown>['cancellation']
}>

/**
 * The plugin of `SessionLogAgentJournalProvider` with the trusted cancellation installation that
 * the assembly entry hands in (R2-D35, R2-D16). The `inject`, the configuration and the provided
 * keys are those of `SessionLogAgentJournalProvider`; the installation is not a Cordis service and
 * not a configuration member. The Journal of every session this plugin routes to holds it as it
 * is. Use the returned class as `ctx.plugin(Plugin, config)` does with the provider class.
 */
export function createSessionAgentJournalPlugin(
  input: SessionAgentJournalPluginInput = {},
): typeof SessionLogAgentJournalProvider {
  const { cancellation } = input
  return class SessionLogAgentJournalPlugin extends SessionLogAgentJournalProvider {
    constructor(ctx: Context, config: AgentJournalProviderConfig) {
      super(ctx, config, cancellation)
    }
  }
}
