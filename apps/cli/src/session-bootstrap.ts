import { tenantIdEquals, parseTenantId, isOk } from '@omne-harness-lite/identity-values'
import {
  AdmissionFailure,
  type AdmissionTicket,
  type SessionBootstrap,
  type BorrowedRunJournal,
} from '@omne-harness-lite/session-runtime-local'
import {
  createAdmittedEvaluationInputSource,
  createRunEvaluationInputReader,
  createRunRegistryReaders,
  type AdmittedInputSource,
  type RunRegistryReaders,
  type RunRegistryReaderDependencies,
} from '@omne-harness-lite/evaluation-input-store/admitted'
import type { CurrentInputReader } from '@omne-harness-lite/evaluation-input-store'
import type { CurrentEvaluationInputs } from '@omne-harness-lite/asset-evaluation'
import type { ContextSessionSeed } from '@omne-harness-lite/runtime-context'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type { LocalSessionContext } from '@omne-harness-lite/session-runtime-local/cordis'
import { createSessionContext } from './session-context.ts'
import { parseRunLoginBinding } from './session-preparation.ts'
import type { SessionBootstrapOptions } from './session-bootstrap-types.ts'

export interface SessionBootstrapAssembly extends SessionBootstrap {
  /** Trusted host lookup. These references must not be exposed in the ordinary client protocol. */
  readonly context: (scope: SessionScope) => LocalSessionContext | undefined
  readonly inputs: (scope: SessionScope) => CurrentEvaluationInputs | undefined
  /** Trusted host only. Reader lifetime is bounded by both the original Run borrow and this bootstrap. */
  readonly runInputs: (
    scope: SessionScope,
    journal: BorrowedRunJournal,
  ) => CurrentInputReader | undefined
  readonly runRegistry: (
    scope: SessionScope,
    journal: BorrowedRunJournal,
    manifest: RunRegistryReaderDependencies['manifestHistory'],
  ) => RunRegistryReaders | undefined
  readonly close: () => Promise<void>
  readonly retryClose: () => Promise<void>
}

type Initialization = Awaited<ReturnType<SessionBootstrap['initialize']>>
interface SessionRow {
  readonly scope: SessionScope
  readonly ticket: AdmissionTicket
  readonly source: AdmittedInputSource
  context?: LocalSessionContext
  initialized: boolean
  readonly runReaders: Set<CurrentInputReader>
  readonly runRegistries: Set<RunRegistryReaders>
}
/** Application composition of original G28 evidence, current member ordering, legal input and independent Context. */
export function createSessionBootstrap(
  requested: SessionBootstrapOptions,
): SessionBootstrapAssembly {
  const binding = parseRunLoginBinding(requested.source)
  const tenant = parseTenantId(requested.tenant)
  if (
    !binding ||
    !isOk(tenant) ||
    tenant.ok.account !== binding.accountId ||
    typeof requested.contextSeed !== 'function'
  )
    throw new TypeError('Invalid Session bootstrap construction')
  const options = Object.freeze({
    ...requested,
    source: Object.freeze(binding),
    tenant: Object.freeze(tenant.ok),
  })
  const rows = new Map<string, SessionRow>()
  const jobs = new Map<string, Promise<Initialization>>()
  let stopped = false
  function ownedScope(scope: SessionScope) {
    return tenantIdEquals(scope.tenant, options.tenant)
  }
  function matches(
    scope: SessionScope,
    input: Parameters<SessionBootstrap['initialize']>[1],
    ticket: AdmissionTicket,
  ) {
    return (
      ownedScope(scope) &&
      ticket.source.centerId === options.source.centerId &&
      ticket.source.accountId === options.source.accountId &&
      tenantIdEquals(ticket.target.tenant, scope.tenant) &&
      ticket.target.purpose === 'createSession' &&
      ticket.target.session === null &&
      ticket.target.inputPosition === null &&
      ticket.target.operationKey === input.operationKey
    )
  }
  function memberUnavailable(error: unknown): boolean {
    return error instanceof AdmissionFailure && ['denied', 'closed'].includes(error.reason)
  }
  function createRow(scope: SessionScope, ticket: AdmissionTicket): SessionRow {
    const fixed = Object.freeze({
      tenant: Object.freeze({ ...scope.tenant }),
      session: scope.session,
    })
    const source = createAdmittedEvaluationInputSource({
      ...options.inputSource,
      scope: fixed,
      storage: options.storage,
      sessionTenancy: options.tenancy,
      async withAuthorizedUnit(read) {
        try {
          return await options.admission.withMember(
            options.source,
            fixed.tenant,
            options.storage,
            async (unit, guard) => {
              if (!options.admission.authorizeIn(unit, guard, options.source, fixed.tenant))
                throw new AdmissionFailure('denied')
              return { read: await read(unit) }
            },
          )
        } catch (error) {
          if (memberUnavailable(error)) return { unavailable: true }
          throw error
        }
      },
      async readCreationStanding() {
        const original = await options.admission.read(ticket)
        return original.state === 'consumed' && original.memberStanding
          ? original.memberStanding
          : { failure: 'unavailable' }
      },
    })
    return {
      scope: fixed,
      ticket,
      source,
      initialized: false,
      runReaders: new Set(),
      runRegistries: new Set(),
    }
  }
  async function originalSession(scope: SessionScope, ticket: AdmissionTicket) {
    try {
      const recognized = await options.admission.consume(ticket, options.storage, async () => {
        throw new AdmissionFailure('invalid-record')
      })
      return recognized.kind === 'consumed' && recognized.receipt === scope.session
    } catch (error) {
      if (memberUnavailable(error)) return false
      throw error
    }
  }
  async function initializeRow(
    row: SessionRow,
    input: Parameters<SessionBootstrap['initialize']>[1],
  ): Promise<Initialization> {
    if (!(await originalSession(row.scope, row.ticket))) return 'unavailable'
    const captured = await row.source.captureSessionRecipe({
      session: row.scope.session,
      tenant: row.scope.tenant,
      rootDefinition: input.definition,
    })
    if (!('captured' in captured)) return 'unavailable'
    const current = await row.source.reader.read(row.scope.session, row.scope.tenant)
    if (!('input' in current) || stopped) return 'unavailable'
    if (row.initialized) return 'ready'
    const prepared = await options.contextSeed(row.scope, current.input)
    if (!('seed' in prepared) || stopped) return 'unavailable'
    return initializeContext(row, prepared.seed)
  }
  async function initializeContext(
    row: SessionRow,
    seed: ContextSessionSeed,
  ): Promise<Initialization> {
    row.context ??= createSessionContext({
      scope: row.scope,
      storage: options.storage,
      logBacking: options.logBacking,
      access: options.access,
      clock: options.clock,
    })
    await row.context.ready
    if (stopped) return 'unavailable'
    const confirmed = await row.context.initializer.initializeContextSession(row.scope, seed)
    if (confirmed.kind !== 'applied' || stopped) return 'unavailable'
    row.initialized = true
    return 'ready'
  }
  const initialize: SessionBootstrap['initialize'] = async (scope, input, ticket) => {
    if (stopped || !matches(scope, input, ticket)) return 'unavailable'
    let row = rows.get(scope.session)
    if (
      row &&
      (!tenantIdEquals(row.scope.tenant, scope.tenant) ||
        row.ticket.id !== ticket.id ||
        row.ticket.root !== ticket.root)
    )
      throw new TypeError('Session bootstrap received a different original creation')
    if (!row) {
      row = createRow(scope, ticket)
      rows.set(scope.session, row)
    }
    const active = jobs.get(scope.session)
    if (active) return active
    const job = initializeRow(row, input)
    jobs.set(scope.session, job)
    try {
      return await job
    } finally {
      jobs.delete(scope.session)
    }
  }
  function selected(scope: SessionScope) {
    const row = rows.get(scope.session)
    return !stopped && row?.initialized && tenantIdEquals(row.scope.tenant, scope.tenant)
      ? row
      : undefined
  }
  async function closeContext(context: LocalSessionContext, retry: boolean) {
    const ended = retry ? await context.retryClose() : await context.closeAttempt()
    if (ended !== 'closed') throw new Error('Original Session Context close retained')
    const report = await context.closed
    if (!report.complete) throw new Error('Original Session Context close reported failure')
  }
  function selectedRun(scope: SessionScope, journal: BorrowedRunJournal) {
    const row = selected(scope)
    return row &&
      journal.scope.session === scope.session &&
      tenantIdEquals(journal.scope.tenant, scope.tenant) &&
      journal.currentGeneration() === journal.generation
      ? row
      : undefined
  }
  async function close(retry: boolean) {
    if (retry && !stopped) throw new TypeError('Session bootstrap has not started closing')
    stopped = true
    const sourceStops = [...rows.values()].flatMap(row => {
      row.context?.requestStop()
      return [
        row.source.close(),
        ...[...row.runReaders].map(reader => reader.close()),
        ...[...row.runRegistries].map(reader => reader.close()),
      ]
    })
    const work = await Promise.allSettled([...jobs.values(), ...sourceStops])
    const failures = work.flatMap(result => (result.status === 'rejected' ? [result.reason] : []))
    for (const row of rows.values()) {
      if (!row.context) continue
      try {
        await closeContext(row.context, retry)
      } catch (error) {
        failures.push(error)
      }
    }
    if (failures.length) throw new AggregateError(failures, 'Session bootstrap close incomplete')
    rows.clear()
  }
  return Object.freeze<SessionBootstrapAssembly>({
    initialize,
    context: scope => selected(scope)?.context,
    inputs: scope => {
      const row = selected(scope)
      return row ? Object.freeze({ read: row.source.reader.read }) : undefined
    },
    runInputs: (scope, journal) => {
      const row = selectedRun(scope, journal)
      if (!row) return undefined
      const source = createRunEvaluationInputReader({
        ...options.inputSource,
        scope: row.scope,
        storage: options.storage,
        sessionTenancy: options.tenancy,
        withOriginalRunUnit: journal.withReadUnit,
      })
      const reader: CurrentInputReader = Object.freeze({
        read: source.read,
        async close() {
          await source.close()
          row.runReaders.delete(reader)
        },
      })
      row.runReaders.add(reader)
      return reader
    },
    runRegistry: (scope, journal, manifestHistory) => {
      const row = selectedRun(scope, journal)
      if (!row) return undefined
      const source = createRunRegistryReaders({
        ...options.inputSource,
        scope: row.scope,
        storage: options.storage,
        sessionTenancy: options.tenancy,
        withOriginalRunUnit: journal.withReadUnit,
        manifestHistory,
      })
      const reader: RunRegistryReaders = Object.freeze({
        fixedRoot: source.fixedRoot,
        history: source.history,
        async close() {
          await source.close()
          row.runRegistries.delete(reader)
        },
      })
      row.runRegistries.add(reader)
      return reader
    },
    close: () => close(false),
    retryClose: () => close(true),
  })
}
export type { SessionBootstrapOptions } from './session-bootstrap-types.ts'
