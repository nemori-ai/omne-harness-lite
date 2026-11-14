import { symbols, type Context } from '@deepseek-ai/cordis'
import type { SystemActionAuthorization } from '@omne-harness/authorization'
import { tenantCodec, tenantEquals } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  mutationAccessRequest,
  type SessionAccessCheck,
  type SessionAccessRequest,
  type SessionCheckedAccess,
  type SessionDelegatedTransactions,
  type SessionFailure,
  type SessionPrincipalBindingSource,
  type SessionTransactionPort,
} from '@omne-harness/session-contract'
import type { SessionCursorSigning } from '@omne-harness/session-cordis-contract'
import {
  SessionDelegatedTransactionsService,
  SessionPrincipalBindingsService,
  SessionScopeOwnersService,
  SessionTransactionPortService,
  sessionAccessCheckKey,
  sessionClockKey,
  sessionCursorSigningKey,
  sessionDelegatedTransactionsKey,
  sessionPrincipalBindingsKey,
  sessionScopeOwnersKey,
  sessionTransactionsKey,
} from '@omne-harness/session-cordis-contract/cordis'
import { createSessionCommitNotifier } from '@omne-harness/session-cordis/cordis'
import {
  createSessionPrincipalBindings,
  createSessionScopeOwners,
  createSessionStorage,
  registerSessionNotifier,
  type SessionStorageOptions,
} from '@omne-harness/session-storage-sql'
import type {
  CombinationRegistrationV2,
  SqlStorage,
  TenantDomainAccess,
  TenantDomainLookup,
  TenantDomains,
} from '@omne-harness/sql-contract'
import {
  TenantDomainLookupService,
  TenantDomainsService,
  storageKey,
  tenantDomainLookupKey,
  tenantDomainsKey,
} from '@omne-harness/sql-contract/cordis'
import { defineRow, type RowHandle } from '../../row.ts'
import { monotonicClock } from '../../shutdown.ts'
import { storageCatalog } from '../storage/catalog.ts'
import { systemActionAuthorizationKey } from '../authorization/system-action-service.ts'
import { sessionPermissionBackendKey } from '../governance/session-permission-backend-service.ts'
import { boundAccessCheck } from './bound.ts'
import { SESSION_COMPOSITE_PARTICIPANTS, compositeManifestDigest } from './composite.ts'
import { sessionStorageRowConfigSchema, type SessionStorageRowConfig } from './config.ts'
import { openTenantDirectory, type RegisterOutcome, type TenantDirectory } from './directory.ts'
import { createTenantEnumeration } from './enumeration.ts'

export const OWNER = 'apps/harness-server/session-storage'

const unavailable = (diagnostic: string): Outcome<never, SessionFailure> =>
  fail<SessionFailure>({ kind: 'unavailable', owner: OWNER, diagnostic })

function lateBoundCursorSigning(ctx: Context): SessionCursorSigning {
  const current = (): SessionCursorSigning | undefined => ctx.get(sessionCursorSigningKey)
  return {
    sign: payload => current()?.sign(payload) ?? Promise.resolve({ kind: 'unavailable' }),
    verify: input => current()?.verify(input) ?? Promise.resolve({ kind: 'unavailable' }),
  }
}

type RegisterEntry = Parameters<Parameters<typeof openTenantDirectory>[0]['register']>[0]

function registerWith(
  storage: SqlStorage,
  combination: Readonly<{ combinationVersion: string; manifestDigest: string }>,
  isOpen: () => boolean,
): (entry: RegisterEntry) => Promise<RegisterOutcome> {
  return async entry => {
    if (!isOpen()) return { kind: 'unavailable', diagnostic: 'session storage is stopping' }
    const input: CombinationRegistrationV2 = {
      scope: entry.domain.scope,
      transactionDomain: entry.domain.transactionDomain,
      combinationVersion: combination.combinationVersion,
      manifestDigest: combination.manifestDigest,
      participants: [...SESSION_COMPOSITE_PARTICIPANTS],
    }
    let result = await storage.registerCombination(input)
    if (result.kind === 'unknown' && isOpen()) result = await storage.registerCombination(input)
    if (!isOpen()) return { kind: 'unavailable', diagnostic: 'session storage is stopping' }
    switch (result.kind) {
      case 'registered':
        return { kind: 'registered' }
      case 'rejected_before_accept':
        return {
          kind: 'unavailable',
          diagnostic: `registration rejected: ${result.reason}${result.diagnostic === null || result.diagnostic === result.reason ? '' : ` (${result.diagnostic})`}`,
        }
      case 'unknown':
        return { kind: 'unavailable', diagnostic: 'registration outcome unknown after one retry' }
    }
  }
}

type CommitInput<P> = Parameters<SessionTransactionPort<P>['commit']>[0]

function registeringOnCreate<P>(
  port: SessionTransactionPort<P>,
  directory: TenantDirectory,
  authorize: (input: CommitInput<P>) => Promise<boolean>,
): SessionTransactionPort<P> {
  const commit = async (input: CommitInput<P>): Promise<Outcome<unknown, SessionFailure>> => {
    const { command, access } = input
    if (
      command.kind === 'create' &&
      tenantEquals(access.tenant, command.input.tenant) &&
      access.session === command.input.session
    ) {
      const text = tenantCodec.encode(command.input.tenant)
      if (text.ok && !directory.holds(text.value) && (await authorize(input))) {
        const registered = await directory.ensureRegistered(text.value)
        if (registered.kind === 'unavailable')
          return unavailable(`tenant domain registration: ${registered.diagnostic}`)
      }
    }
    return port.commit(input)
  }
  return { ...port, commit: commit as SessionTransactionPort<P>['commit'] }
}

function boundCreateTenant<P>(request: SessionAccessRequest<P>): string | null {
  if (request.operation !== 'create') return null
  const { command } = request.target
  if (
    !tenantEquals(request.access.tenant, command.input.tenant) ||
    request.target.session !== command.input.session
  )
    return null
  const text = tenantCodec.encode(command.input.tenant)
  return text.ok ? text.value : null
}

function registeringAccess(directory: TenantDirectory, tenantText: string): TenantDomainAccess {
  return {
    ...directory.access,
    resolve: input =>
      input.tenant === tenantText
        ? directory.ensureRegistered(input.tenant)
        : directory.access.resolve(input),
  }
}

const DENIED_IN_VIEW = [
  'commitEntries',
  'commitLog',
  'pending',
  'references',
  'releasedScopes',
] as const

function boundTenantText<P>(request: SessionAccessRequest<P>): string | null {
  if (request.target.kind !== 'session' || !('tenant' in request.access)) return null
  const text = tenantCodec.encode(request.access.tenant)
  return text.ok ? text.value : null
}

function unregisteredTenantIsAbsent<P>(
  view: SessionTransactionPort<P>,
  directory: TenantDirectory,
  tenantText: string | null,
): SessionTransactionPort<P> {
  if (tenantText === null) return view
  const absent = (action: string) =>
    Promise.resolve(fail<SessionFailure>({ kind: 'denied', action }))
  const guard =
    <A extends unknown[], R>(action: string, call: (...args: A) => Promise<R>) =>
    (...args: A): Promise<R> =>
      directory.holds(tenantText) ? call(...args) : (absent(action) as Promise<R>)
  const commit = async (input: CommitInput<P>): Promise<Outcome<unknown, SessionFailure>> =>
    directory.holds(tenantText) ? view.commit(input) : absent('commit')
  return {
    ...view,
    commit: commit as SessionTransactionPort<P>['commit'],
    readWork: guard('readWork', view.readWork),
    readInput: guard('readInput', view.readInput),
    queryOperation: guard('queryOperation', view.queryOperation),
    queryControlOperation: guard('queryControlOperation', view.queryControlOperation),
    readModelSelection: guard('readModelSelection', view.readModelSelection),
    history: {
      begin: guard('history.begin', view.history.begin),
      next: guard('history.next', view.history.next),
      since: guard('history.since', view.history.since),
      readModelView: guard('history.readModelView', view.history.readModelView),
    },
  }
}

function emptyListWhenUnregistered<P>(
  port: SessionTransactionPort<P>,
  directory: TenantDirectory,
): SessionTransactionPort<P> {
  const inner = port.directory
  if (inner === undefined) return port
  return {
    ...port,
    directory: {
      list: async input => {
        const answer = await inner.list(input)
        if (!('failure' in answer) || answer.failure.kind !== 'unavailable') return answer
        const text = tenantCodec.encode(input.tenant)
        return text.ok && !directory.holds(text.value)
          ? succeed({ items: [], next: null, completeness: 'complete' as const })
          : answer
      },
    },
  }
}

function delegatedView(
  base: SessionStorageOptions<unknown>,
  directory: TenantDirectory,
  checked: SessionCheckedAccess<unknown>,
): SessionTransactionPort<unknown> {
  const creating = boundCreateTenant(checked.request)
  const view = createSessionStorage({
    ...base,
    ...(creating === null ? {} : { domains: registeringAccess(directory, creating) }),
    accessCheck: boundAccessCheck(checked),
  })
  const denied = (action: (typeof DENIED_IN_VIEW)[number]) => () =>
    Promise.resolve(fail<SessionFailure>({ kind: 'denied', action }))
  const bound: SessionTransactionPort<unknown> = {
    ...view,
    commitEntries: denied('commitEntries'),
    commitLog: denied('commitLog'),
    pending: denied('pending'),
    references: denied('references'),
    releasedScopes: denied('releasedScopes'),
  }
  const listed = emptyListWhenUnregistered(bound, directory)
  return creating === null
    ? unregisteredTenantIsAbsent(listed, directory, boundTenantText(checked.request))
    : listed
}

class SessionTransactionsImpl extends SessionTransactionPortService<unknown> {
  readonly commit: SessionTransactionPort<unknown>['commit']
  readonly readWork: SessionTransactionPort<unknown>['readWork']
  readonly readInput: SessionTransactionPort<unknown>['readInput']
  readonly queryOperation: SessionTransactionPort<unknown>['queryOperation']
  readonly queryControlOperation: SessionTransactionPort<unknown>['queryControlOperation']
  readonly readModelSelection: SessionTransactionPort<unknown>['readModelSelection']
  readonly commitEntries: SessionTransactionPort<unknown>['commitEntries']
  declare readonly commitLog?: NonNullable<SessionTransactionPort<unknown>['commitLog']>
  readonly history: SessionTransactionPort<unknown>['history']
  readonly pending: SessionTransactionPort<unknown>['pending']
  declare readonly directory?: NonNullable<SessionTransactionPort<unknown>['directory']>
  readonly references: SessionTransactionPort<unknown>['references']
  readonly releasedScopes: SessionTransactionPort<unknown>['releasedScopes']

  constructor(ctx: Context, port: SessionTransactionPort<unknown>) {
    super(ctx)
    this.commit = port.commit
    this.readWork = port.readWork
    this.readInput = port.readInput
    this.queryOperation = port.queryOperation
    this.queryControlOperation = port.queryControlOperation
    this.readModelSelection = port.readModelSelection
    this.commitEntries = port.commitEntries
    if (port.commitLog !== undefined) this.commitLog = port.commitLog
    this.history = port.history
    this.pending = port.pending
    if (port.directory !== undefined) this.directory = port.directory
    this.references = port.references
    this.releasedScopes = port.releasedScopes
  }
}

class DelegatedTransactionsImpl extends SessionDelegatedTransactionsService<unknown> {
  readonly bind: SessionDelegatedTransactions<unknown>['bind']
  constructor(ctx: Context, bind: SessionDelegatedTransactions<unknown>['bind']) {
    super(ctx)
    this.bind = bind
  }
}

function lateBoundSystemActions(ctx: Context): SystemActionAuthorization {
  return {
    check: input =>
      ctx.get(systemActionAuthorizationKey)?.check(input) ??
      Promise.resolve({
        kind: 'unavailable',
        diagnostic: 'systemActionAuthorization is not provided',
      }),
  }
}

class TenantDomainsImpl extends TenantDomainsService<unknown> {
  readonly enumerate: TenantDomains<unknown>['enumerate']
  constructor(ctx: Context, directory: TenantDomainAccess) {
    super(ctx)
    this.enumerate = createTenantEnumeration(lateBoundSystemActions(ctx), directory).enumerate
  }
}

class TenantDomainLookupImpl extends TenantDomainLookupService {
  readonly lookup: TenantDomainLookup['lookup']
  constructor(ctx: Context, lookup: TenantDomainLookup) {
    super(ctx)
    this.lookup = input => lookup.lookup(input)
  }
}

class ScopeOwnersImpl extends SessionScopeOwnersService {
  readonly lookup: SessionScopeOwnersService['lookup']
  constructor(ctx: Context, source: SessionScopeOwnersService['lookup']) {
    super(ctx)
    this.lookup = input => source(input)
  }
}

class PrincipalBindingsImpl extends SessionPrincipalBindingsService {
  readonly read: SessionPrincipalBindingSource['read']
  constructor(ctx: Context, source: SessionPrincipalBindingSource) {
    super(ctx)
    this.read = input => source.read(input)
  }
}

async function body(ctx: Context, raw: unknown): Promise<RowHandle> {
  const config: SessionStorageRowConfig = sessionStorageRowConfigSchema.parse(raw)
  const storage: SqlStorage = ctx.storage
  const accessCheck: SessionAccessCheck<unknown> = ctx.sessionAccessCheck
  const manifest = compositeManifestDigest(storageCatalog())
  if (manifest.kind === 'invalid')
    throw new Error(`session storage composite is not registrable: ${manifest.diagnostic}`)
  const combination = {
    combinationVersion: config.combinationVersion,
    manifestDigest: manifest.digest,
  }
  let active = true
  const origin = (value: object | undefined): unknown =>
    value === undefined ? undefined : (Reflect.get(value, symbols.original) ?? value)
  const storageOrigin = origin(storage)
  const accessOrigin = origin(accessCheck)
  const isOpen = () =>
    active &&
    ctx.fiber.uid !== null &&
    origin(ctx.get(storageKey)) === storageOrigin &&
    origin(ctx.get(sessionAccessCheckKey)) === accessOrigin
  const directory = openTenantDirectory({
    file: config.directoryFile,
    register: registerWith(storage, combination, isOpen),
  })
  ctx.effect(
    () => () => {
      active = false
      void directory.close(monotonicClock.now())
    },
    'session-storage.directory',
  )
  const existing = await directory.access.snapshot()
  if (existing.kind !== 'ready') throw new Error('session storage: directory is unavailable')
  for (const entry of existing.value.entries) {
    const registered = await directory.ensureRegistered(entry.tenant)
    if (registered.kind !== 'ready')
      throw new Error('session storage: current combination registration failed')
  }
  if (!isOpen()) throw new Error('session storage: stopped before publishing services')
  const unregister = registerSessionNotifier(storage, createSessionCommitNotifier(ctx))
  ctx.effect(() => unregister, 'session-storage.notices')
  const base: SessionStorageOptions<unknown> = {
    intakeLimits: config.intakeLimits,
    storage,
    domains: directory.access,
    accessCheck,
    cursorSigning: lateBoundCursorSigning(ctx),
    // Without the service the commit has no time; it is never the wall clock of this process.
    clock: {
      sample: () =>
        ctx.get(sessionClockKey)?.sample() ??
        Promise.resolve(
          fail<SessionFailure>({
            kind: 'unavailable',
            owner: OWNER,
            diagnostic: 'no sessionClock is mounted',
          }),
        ),
    },
    combination,
    protectedBasis: commit =>
      ctx.get(sessionPermissionBackendKey)?.basis(commit) ??
      Promise.resolve(
        fail<SessionFailure>({
          kind: 'unavailable',
          owner: 'harness.session-permission-write',
          diagnostic: 'no backend forms the basis of a Session permission write',
        }),
      ),
  }
  const port = emptyListWhenUnregistered(
    registeringOnCreate(
      createSessionStorage(base),
      directory,
      async input =>
        (await accessCheck.check(mutationAccessRequest(input.access, input.command))).kind ===
        'allowed',
    ),
    directory,
  )
  new SessionTransactionsImpl(ctx, port)
  new DelegatedTransactionsImpl(ctx, checked => delegatedView(base, directory, checked))
  new TenantDomainsImpl(ctx, directory.access)
  new TenantDomainLookupImpl(ctx, directory.lookup)
  const bindings = createSessionPrincipalBindings({ storage, domains: directory.access })
  new PrincipalBindingsImpl(ctx, bindings)
  const scopeOwners = createSessionScopeOwners({ storage, domains: directory.access })
  new ScopeOwnersImpl(ctx, input => scopeOwners.lookup(input))
  return {
    stop: deadline => {
      active = false
      unregister()
      bindings.stop()
      scopeOwners.stop()
      return directory.close(deadline)
    },
  }
}

export const sessionStorageRow = defineRow({
  row: 'session-storage',
  implementation: 'real',
  manifest: {
    provides: [
      sessionTransactionsKey,
      sessionDelegatedTransactionsKey,
      tenantDomainsKey,
      tenantDomainLookupKey,
      sessionPrincipalBindingsKey,
      sessionScopeOwnersKey,
    ],
    injects: [storageKey, sessionAccessCheckKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'body', phase: 'composition' },
  Config: sessionStorageRowConfigSchema,
  body,
})
