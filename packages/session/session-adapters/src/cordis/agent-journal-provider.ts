import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type {
  AgentExecutionId,
  AgentJournal,
  AgentJournalEntries,
  AgentMaterials,
  AgentReceivedCommits,
  AgentReceivedRecords,
  CompactionInputStore,
  Failure,
  ModelReceptionTargets,
  ToolReceptionTargets,
} from '@omne-harness/agent-contract'
import {
  AgentJournalEntriesService,
  AgentJournalService,
  AgentMaterialsService,
  AgentReceivedCommitsService,
  AgentReceivedRecordsService,
  CompactionInputStoreService,
  ModelReceptionTargetsService,
  ToolReceptionTargetsService,
} from '@omne-harness/agent-cordis-contract/cordis'
import type { ContentBlock } from '@omne-harness/content-block'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { SessionAccessCheck, SessionId } from '@omne-harness/session-contract'
import type {
  SessionAdoptedRequestRead,
  SessionAdoptedRequests,
} from '@omne-harness/session-cordis-contract'
import {
  SessionAdoptedRequestsService,
  sessionAccessCheckKey,
} from '@omne-harness/session-cordis-contract/cordis'
import {
  SESSION_EXECUTION_HANDLER,
  SESSION_READ_PROTOCOL,
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
import { announcePublished } from './published-queue.ts'
import { createSqlCompactionInputs } from './compaction-inputs-sql.ts'

const OWNER = 'session-log-journal'
const LOGGER = 'session-adapters/agent-journal'
const ROUTE_CACHE_ENTRIES = 4096

export type ExecutionRoutedJournalOptions<P> = Readonly<{
  storage: SqlStorage
  tenantDomainLookup: TenantDomainLookup
  sessionAccessCheck: SessionAccessCheck<P>
  combination: JournalCombination
  routeCacheEntries?: number
  cancellation?: SessionLogJournalOptions<P>['cancellation']
  published?: (tenant: TenantId, session: SessionId, execution: AgentExecutionId) => void
  fault?: SessionLogJournalOptions<P>['fault']
  report?: SessionLogJournalOptions<P>['report']
}>

type Journal<P> = AgentJournal<P>
type RoutedJournal<P> = Journal<P> & Required<Pick<Journal<P>, 'readFinish'>>
type Materials<P> = AgentMaterials<P, ContentBlock>
type SessionView<P> = SessionLogJournalProvider<P>
type Scope = Readonly<{ tenant: TenantId; execution: AgentExecutionId }>
type Route<P> = Readonly<{ session: SessionId; view: SessionView<P> }>

const unavailable = (diagnostic: string): Failure => ({
  kind: 'unavailable',
  owner: OWNER,
  diagnostic,
})

export function createExecutionRoutedJournal<P>(options: ExecutionRoutedJournalOptions<P>) {
  const journals = createSessionLogJournal<P>({
    storage: options.storage,
    tenantDomainLookup: options.tenantDomainLookup,
    sessionAccessCheck: options.sessionAccessCheck,
    combination: options.combination,
    ...(options.cancellation === undefined ? {} : { cancellation: options.cancellation }),
    ...(options.fault === undefined ? {} : { fault: options.fault }),
    ...(options.report === undefined ? {} : { report: options.report }),
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
        protocol: SESSION_READ_PROTOCOL,
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

  async function viewOf(scope: Scope, action: string): Promise<Outcome<SessionView<P>, Failure>> {
    const found = await routeOf(scope, action)
    return 'failure' in found ? fail<Failure>(found.failure) : succeed(found.ok.view)
  }

  function announce(scope: Scope, session: SessionId): void {
    if (closed || options.published === undefined) return
    try {
      options.published(scope.tenant, session, scope.execution)
    } catch {}
  }

  function routedView<A>(
    action: string,
    scope: Scope,
    call: (view: SessionView<P>) => Promise<Outcome<A, Failure>>,
  ): Promise<Outcome<A, Failure>> {
    return viewOf(scope, action).then(found =>
      'failure' in found ? fail<Failure>(found.failure) : call(found.ok),
    )
  }

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

  function routed<A>(
    action: string,
    scope: Scope,
    call: (journal: Journal<P>) => Promise<Outcome<A, Failure>>,
  ): Promise<Outcome<A, Failure>> {
    return routedView(action, scope, view => call(view.journal))
  }

  function written<A>(
    action: string,
    scope: Scope,
    call: (journal: Journal<P>) => Promise<Outcome<A, Failure>>,
  ): Promise<Outcome<A, Failure>> {
    return routedWrite(action, scope, view => call(view.journal))
  }

  const journal: RoutedJournal<P> = {
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
    acknowledge: input => routed('acknowledge', input, j => j.acknowledge(input)),
    recordResult: input => written('recordResult', input, j => j.recordResult(input)),
    recordControl: input => written('recordControl', input, j => j.recordControl(input)),
    recordHandoff: input => written('recordHandoff', input, j => j.recordHandoff(input)),
    prepareFinish: input => routed('prepareFinish', input, j => j.prepareFinish(input)),
    tryFinish: input => written('tryFinish', input, j => j.tryFinish(input)),
    commitSettlement: input => written('commitSettlement', input, j => j.commitSettlement(input)),
    recordTerminalObservation: input =>
      written('recordTerminalObservation', input, j => j.recordTerminalObservation(input)),
    readCancellationInstallation: input =>
      routed(
        'readCancellationInstallation',
        input,
        async j =>
          (await j.readCancellationInstallation?.(input)) ??
          fail(unavailable('the session Journal has no cancellation installation read')),
      ),
    load: input => routed('load', input, j => j.load(input)),
    inputs: input => routed('inputs', input, j => j.inputs(input)),
    readReplyAdmissions: input =>
      routed('readReplyAdmissions', input, j => j.readReplyAdmissions(input)),
    readFinish: input =>
      routed(
        'readFinish',
        input,
        async j =>
          (await j.readFinish?.(input)) ??
          fail(unavailable('the session Journal has no finish read')),
      ),
    query: input => routed('query', input, j => j.query(input)),
    output: {
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
    read: input => routedView('entries.read', input, view => view.entries.read(input)),
    receivedOf: input =>
      routedView('entries.receivedOf', input, view => view.entries.receivedOf(input)),
  }

  const adoptedRequests: SessionAdoptedRequests<P> = {
    async readAdoptedRequest(input): Promise<SessionAdoptedRequestRead> {
      if (closed) return { kind: 'unavailable', diagnostic: 'the agentJournal plugin has stopped' }
      const { access, session } = input
      if (!tenantCodec.encode(access.tenant).ok) return { kind: 'denied' }
      let decision
      try {
        decision = await options.sessionAccessCheck.check({
          access,
          operation: 'history.readModelView',
          target: { kind: 'session', session },
        })
      } catch (error) {
        return { kind: 'unavailable', diagnostic: `the access check threw: ${String(error)}` }
      }
      if (decision.kind === 'denied') return { kind: 'denied' }
      if (decision.kind !== 'allowed') return decision
      const read = await journals.readAdopted({ tenant: access.tenant, session })
      if (read.kind !== 'value' || read.value === null) return read
      return { kind: 'value', value: { ...read.value } }
    },
  }

  const received: AgentReceivedCommits<P, ContentBlock> = {
    commit: input => routedWrite('received', input, view => view.received.commit(input)),
    query: input => routedView('received.query', input, view => view.received.query(input)),
  }

  const targets: ModelReceptionTargets<P> = {
    forExecution: input =>
      routedView(
        'targets.forExecution',
        { tenant: input.access.tenant, execution: input.execution },
        view => view.targets.forExecution(input),
      ),
    async resolve(input) {
      const { execution } = input
      if (execution === undefined) return fail<Failure>({ kind: 'denied', action: 'resolve' })
      const found = await routedView('resolve', { tenant: input.access.tenant, execution }, view =>
        view.targets.resolve(input),
      )
      if ('ok' in found && found.ok.execution !== execution)
        return fail<Failure>({ kind: 'denied', action: 'resolve' })
      return found
    },
  }

  const toolTargets: ToolReceptionTargets<P> = {
    forExecution: input =>
      routedView(
        'toolTargets.forExecution',
        { tenant: input.access.tenant, execution: input.execution },
        view => view.toolTargets.forExecution(input),
      ),
    async resolve(input) {
      const { execution } = input
      if (execution === undefined) return fail<Failure>({ kind: 'denied', action: 'resolve' })
      const found = await routedView(
        'toolTargets.resolve',
        { tenant: input.access.tenant, execution },
        view => view.toolTargets.resolve(input),
      )
      if ('ok' in found && found.ok !== null && found.ok.execution !== execution)
        return fail<Failure>({ kind: 'denied', action: 'resolve' })
      return found
    },
  }

  const stopped = () => fail<Failure>(unavailable('the agentJournal plugin has stopped'))
  const materials: Materials<P> = {
    preserve(input) {
      if (closed) return Promise.resolve(stopped())
      const { execution } = input
      return routedView('preserve', { tenant: input.tenant, execution }, view =>
        view.materials.preserve(input),
      )
    },
    async read(input) {
      if (closed) return stopped()
      const tenant = tenantCodec.encode(input.tenant)
      if (!tenant.ok) return fail({ kind: 'denied', action: 'materials.read' })
      const named = materialSessionOf(input.source)
      if (named === null || named.tenant !== tenant.value)
        return fail(unavailable('the material source names no session of this tenant'))
      return journals
        .forSession({ tenant: input.tenant, session: named.session })
        .materials.read(input)
    },
    async describe(input) {
      if (closed) return stopped()
      const tenant = tenantCodec.encode(input.tenant)
      if (!tenant.ok) return fail({ kind: 'denied', action: 'materials.describe' })
      const named = materialSessionOf(input.source)
      if (named === null || named.tenant !== tenant.value)
        return fail(unavailable('the material source names no session of this tenant'))
      return journals
        .forSession({ tenant: input.tenant, session: named.session })
        .materials.describe(input)
    },
  }

  const compactionInputs = createSqlCompactionInputs({
    storage: options.storage,
    tenantDomainLookup: options.tenantDomainLookup,
    sessionAccessCheck: options.sessionAccessCheck,
    combination: options.combination,
    async sessionOf(input) {
      const route = await routeOf(input, 'compaction-input')
      return 'failure' in route ? route : succeed(route.ok.session)
    },
  })

  return {
    journal,
    entries,
    materials,
    received,
    targets,
    toolTargets,
    adoptedRequests,
    compactionInputs,
    close(): void {
      closed = true
      routes.clear()
    },
  }
}

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

class SessionLogJournalEntries extends AgentJournalEntriesService<unknown> {
  readonly record: AgentJournalEntries<unknown>['record']
  readonly read: AgentJournalEntries<unknown>['read']
  readonly receivedOf: AgentJournalEntries<unknown>['receivedOf']

  constructor(ctx: Context, entries: AgentJournalEntries<unknown>) {
    super(ctx)
    this.record = entries.record
    this.read = entries.read
    this.receivedOf = entries.receivedOf
  }
}

class SessionLogMaterials extends AgentMaterialsService<unknown, ContentBlock> {
  readonly preserve: Materials<unknown>['preserve']
  readonly read: Materials<unknown>['read']
  readonly describe: Materials<unknown>['describe']

  constructor(ctx: Context, materials: Materials<unknown>) {
    super(ctx)
    this.preserve = materials.preserve
    this.read = materials.read
    this.describe = materials.describe
  }
}

class SessionLogCompactionInputs extends CompactionInputStoreService<unknown> {
  readonly freeze: CompactionInputStore<unknown>['freeze']
  readonly read: CompactionInputStore<unknown>['read']

  constructor(ctx: Context, inputs: CompactionInputStore<unknown>) {
    super(ctx)
    this.freeze = inputs.freeze
    this.read = inputs.read
  }
}

class SessionLogReceivedCommits extends AgentReceivedCommitsService<unknown, ContentBlock> {
  readonly commit: AgentReceivedCommits<unknown, ContentBlock>['commit']
  readonly query: AgentReceivedCommits<unknown, ContentBlock>['query']

  constructor(ctx: Context, received: AgentReceivedCommits<unknown, ContentBlock>) {
    super(ctx)
    this.commit = received.commit
    this.query = received.query
  }
}

class SessionLogReceivedRecords extends AgentReceivedRecordsService<unknown> {
  readonly query: AgentReceivedRecords<unknown>['query']

  constructor(ctx: Context, received: AgentReceivedCommits<unknown, ContentBlock>) {
    super(ctx)
    this.query = received.query
  }
}

class SessionLogReceptionTargets extends ModelReceptionTargetsService<unknown> {
  readonly forExecution: ModelReceptionTargets<unknown>['forExecution']
  readonly resolve: ModelReceptionTargets<unknown>['resolve']

  constructor(ctx: Context, targets: ModelReceptionTargets<unknown>) {
    super(ctx)
    this.forExecution = targets.forExecution
    this.resolve = targets.resolve
  }
}

class SessionLogToolReceptionTargets extends ToolReceptionTargetsService<unknown> {
  readonly forExecution: ToolReceptionTargets<unknown>['forExecution']
  readonly resolve: ToolReceptionTargets<unknown>['resolve']

  constructor(ctx: Context, targets: ToolReceptionTargets<unknown>) {
    super(ctx)
    this.forExecution = targets.forExecution
    this.resolve = targets.resolve
  }
}

class SessionLogAdoptedRequests extends SessionAdoptedRequestsService<unknown> {
  readonly readAdoptedRequest: SessionAdoptedRequests<unknown>['readAdoptedRequest']

  constructor(ctx: Context, requests: SessionAdoptedRequests<unknown>) {
    super(ctx)
    this.readAdoptedRequest = requests.readAdoptedRequest
  }
}

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
  readonly readCancellationInstallation: AgentJournal<unknown>['readCancellationInstallation']
  readonly load: AgentJournal<unknown>['load']
  readonly inputs: AgentJournal<unknown>['inputs']
  readonly readReplyAdmissions: AgentJournal<unknown>['readReplyAdmissions']
  readonly readFinish: NonNullable<AgentJournal<unknown>['readFinish']>
  readonly query: AgentJournal<unknown>['query']
  readonly output: AgentJournal<unknown>['output']

  constructor(
    ctx: Context,
    config: AgentJournalProviderConfig,
    cancellation?: SessionLogJournalOptions<unknown>['cancellation'],
    report?: SessionLogJournalOptions<unknown>['report'],
  ) {
    super(ctx)
    const logger = ctx.logger(LOGGER)
    const logged: NonNullable<SessionLogJournalOptions<unknown>['report']> = item => {
      const line = `publication ${item.method} of ${item.execution} (operation ${String(item.operation)}): ${item.outcome}, ${String(item.recordBytes)} bytes of Agent records, ${String(item.bytes)} in all`
      if (item.outcome === 'unavailable' || item.outcome === 'commit-unknown')
        logger.warn(`${line}: ${String(item.diagnostic)}`)
      else logger.debug(line)
    }
    const routed = createExecutionRoutedJournal<unknown>({
      published: (tenant, session, execution) =>
        announcePublished(ctx, line => logger.warn(line), { tenant, session, execution }),
      fault: diagnostic => logger.error(diagnostic),
      report: report ?? logged,
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
    this.readCancellationInstallation = journal.readCancellationInstallation
    this.load = journal.load
    this.inputs = journal.inputs
    this.readReplyAdmissions = journal.readReplyAdmissions
    this.readFinish = journal.readFinish
    this.query = journal.query
    this.output = journal.output
    new SessionLogJournalEntries(ctx, routed.entries)
    new SessionLogMaterials(ctx, routed.materials)
    new SessionLogCompactionInputs(ctx, routed.compactionInputs)
    new SessionLogReceivedCommits(ctx, routed.received)
    new SessionLogReceivedRecords(ctx, routed.received)
    new SessionLogReceptionTargets(ctx, routed.targets)
    new SessionLogToolReceptionTargets(ctx, routed.toolTargets)
    new SessionLogAdoptedRequests(ctx, routed.adoptedRequests)
    ctx.effect(() => () => routed.close())
  }
}

export type SessionAgentJournalPluginInput = Readonly<{
  cancellation?: SessionLogJournalOptions<unknown>['cancellation']
  report?: SessionLogJournalOptions<unknown>['report']
}>

export function createSessionAgentJournalPlugin(
  input: SessionAgentJournalPluginInput = {},
): typeof SessionLogAgentJournalProvider {
  const { cancellation, report } = input
  return class SessionLogAgentJournalPlugin extends SessionLogAgentJournalProvider {
    constructor(ctx: Context, config: AgentJournalProviderConfig) {
      super(ctx, config, cancellation, report)
    }
  }
}
