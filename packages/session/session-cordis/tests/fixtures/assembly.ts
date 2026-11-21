import { Context, Service, type Fiber } from '@deepseek-ai/cordis'
import { fail } from '@omne-harness/operation-result'
import type {
  CommitReceipt,
  GuardCommand,
  SessionAccess,
  SessionCallerClass,
  SessionEvidenceBridge,
} from '@omne-harness/session-contract'
import {
  AgentDrivePortService,
  ScopeReleasePortService,
  SessionAccessCheckService,
  SessionClockService,
  SessionContextInputService,
  SessionDelegatedTransactionsService,
  SessionEvidenceBridgeService,
  SessionIdentityBridgeService,
  SessionIdleInputService,
  SessionInternalPrincipalsService,
  SessionNotifierService,
  SessionTransactionPortService,
  SessionWorkPrincipalsService,
  sessionInputSourcesKey,
  sessionInputSourcesPlugin,
  type SessionService,
} from '@omne-harness/session-cordis-contract/cordis'
import {
  createMemoryAgentDrive,
  createMemoryScopeRelease,
  createMemorySessionClock,
  createMemorySessionContextInput,
  createMemorySessionEvidenceBridge,
  createMemorySessionIdleInput,
  createMemorySessionNotifier,
  createPolicySessionAccessCheck,
  createScriptedSessionIdentityBridge,
  creation,
  evidence,
  memoryAccess,
  memoryOtherAccess,
  operationId,
  ordinaryInput,
  sessionId,
  succeeded,
  TESTING_DECLARATIONS,
} from '@omne-harness/session-contract/testing'
import {
  createMemorySessionPrincipalBindings,
  createMemorySessionWorkPrincipals,
} from '@omne-harness/session-cordis-contract/testing'
import { createSessionCommitNotifier, SessionProvider } from '../../src/cordis.ts'
import { memoryBackend, type Backend, type BackendFactory } from './backends.ts'
import { policy, prefixOf, TENANT_A } from './tenants.ts'

export const LIFECYCLE_KEY = 's0.assemblyLifecycle'

export const FIBER_STATE = { PENDING: 0, LOADING: 1, ACTIVE: 2, FAILED: 3, DISPOSED: 4 } as const

export const INJECTED = [
  'sessionAccessCheck',
  'sessionDelegatedTransactions',
  'sessionPrincipals',
  'sessionWorkPrincipals',
  'assemblyLifecycle',
] as const
export const READ_PER_CALL = [
  'sessionTransactions',
  'sessionIdentity',
  'sessionEvidence',
  'sessionContextInput',
  'sessionIdleInput',
  'sessionClock',
  'sessionNotifier',
  'sessionAgentDrive',
  'sessionScopeRelease',
] as const
export type PortName = (typeof INJECTED)[number] | (typeof READ_PER_CALL)[number]

type Constructible = new (ctx: Context) => object
type AbstractService = abstract new (ctx: Context) => Service

export function serviceOf(
  Base: AbstractService,
  implementation: object,
  name: string,
): Constructible {
  const Concrete = class extends (Base as unknown as Constructible) {
    constructor(ctx: Context) {
      super(ctx)
      Object.assign(this, implementation)
    }
  }
  Object.defineProperty(Concrete, 'name', { value: name })
  return Concrete
}

export type RegisteredHandle = Readonly<{
  phase: string
  row: string
  start(): Promise<void>
  stop(deadline: number): Promise<{ kind: string; detail?: string }>
}>

export type Entry = { readonly handle: RegisteredHandle; stopCalled: boolean }

export function lifecycleService(entries: Map<string, Entry>, log: string[]) {
  return class extends Service {
    constructor(ctx: Context) {
      super(ctx, LIFECYCLE_KEY)
    }
    register(handle: RegisteredHandle): void {
      this.ctx.effect(() => {
        const entry: Entry = { handle, stopCalled: false }
        entries.set(handle.row, entry)
        return () => {
          if (entries.get(handle.row) !== entry) return
          entries.delete(handle.row)
          log.push(`withdrawn:${handle.row}`)
          if (entry.stopCalled) return
          entry.stopCalled = true
          log.push(`withdrawal-stop:${handle.row}`)
          void handle.stop(0).catch(() => undefined)
        }
      }, 'lifecycle.register')
    }
  }
}

const PHASES = ['entry', 'business', 'composition', 'storage'] as const

export async function shutdown(entries: Map<string, Entry>, log: string[]) {
  const results: Record<string, unknown> = {}
  for (const phase of PHASES) {
    const inPhase = [...entries.values()].filter(entry => entry.handle.phase === phase)
    await Promise.all(
      inPhase.map(async entry => {
        entry.stopCalled = true
        log.push(`stop:${entry.handle.row}`)
        results[entry.handle.row] = await entry.handle.stop(Number.MAX_SAFE_INTEGER)
        log.push(`stopped:${entry.handle.row}`)
      }),
    )
  }
  return results
}

export type AssemblyOptions = Readonly<{
  backend?: BackendFactory
  omit?: readonly PortName[]
  provider?: unknown
  plugin?: typeof SessionProvider
  notices?: boolean
}>

export async function assemble(options: AssemblyOptions = {}) {
  const ctx = new Context()
  const mounted: Fiber[] = []
  const checks = createPolicySessionAccessCheck<string>(request => policy(request))
  const backend: Backend = await (options.backend ?? memoryBackend).open(checks)
  const unregister =
    options.notices === false ? () => undefined : backend.register(createSessionCommitNotifier(ctx))

  const hooks = {
    beforeCommit: null as null | (() => Promise<void>),
    pendingTenants: [] as unknown[],
    failPending: 0,
    pendingGate: null as null | Promise<void>,
    invoked: [] as unknown[],
  }

  const bindings = createMemorySessionPrincipalBindings()
  const workPrincipals = createMemorySessionWorkPrincipals<string>({
    bindings,
    issue: request => `${prefixOf(request.tenant)}:${request.actor}`,
  })
  const identity = createScriptedSessionIdentityBridge<string>('allow')
  const context = createMemorySessionContextInput<string>()
  const clock = createMemorySessionClock()
  const notifier = createMemorySessionNotifier()
  const drive = createMemoryAgentDrive()
  const scopeRelease = createMemoryScopeRelease()
  const idle = createMemorySessionIdleInput<string>({
    kind: 'unknown',
    at: {
      at: '2026-01-01T00:00:00.000Z',
      protocol: { owner: 'c', name: 'c', revision: '1', digest: 'd' },
      source: evidence('idle/at'),
    },
    scope: evidence('idle/scope'),
    source: evidence('idle/source'),
  })
  const baseEvidence = createMemorySessionEvidenceBridge()
  const evidenceAccesses: SessionAccess<string>[] = []
  const evidenceBridge: SessionEvidenceBridge<string> & {
    accesses(): readonly SessionAccess<string>[]
  } = {
    accesses: () => [...evidenceAccesses],
    prepare: async (command, access) => {
      if (access === undefined || access.session !== command.input.session)
        return fail({
          kind: 'unavailable',
          owner: 'evidence',
          diagnostic: 'the evidence bridge was not given the access of the original call',
        })
      evidenceAccesses.push(access)
      if (command.kind === 'create' || command.kind === 'completeInitialization') {
        const guards: readonly GuardCommand[] = await backend.initializationGuards(command)
        return { ok: guards }
      }
      return baseEvidence.prepare(command)
    },
  }

  const handles = new Map<string, Entry>()
  const log: string[] = []

  const delegated = {
    bind: (checked: Parameters<Backend['delegated']['bind']>[0]) => {
      const view = backend.delegated.bind(checked)
      return {
        ...view,
        commit: (async (input: never) => {
          await hooks.beforeCommit?.()
          const answer = await view.commit(input)
          log.push('commit-settled')
          return answer
        }) as typeof view.commit,
      }
    },
  }

  const port = backend.transactions
  const publicPort = {
    commit: port.commit.bind(port),
    readWork: port.readWork.bind(port),
    readInput: port.readInput.bind(port),
    queryOperation: port.queryOperation.bind(port),
    queryControlOperation: port.queryControlOperation.bind(port),
    readModelSelection: port.readModelSelection.bind(port),
    commitEntries: port.commitEntries.bind(port),
    history: port.history,
    references: port.references.bind(port),
    releasedScopes: port.releasedScopes.bind(port),
    pending: (async (input: Parameters<typeof port.pending>[0]) => {
      hooks.pendingTenants.push(input.tenant)
      await hooks.pendingGate
      if (hooks.failPending > 0) {
        hooks.failPending -= 1
        return Promise.resolve(
          fail({ kind: 'unavailable' as const, owner: 'storage', diagnostic: 'pending is down' }),
        )
      }
      return port.pending(input)
    }) as typeof port.pending,
  }

  const providers: Record<PortName, () => Constructible> = {
    sessionAccessCheck: () =>
      serviceOf(SessionAccessCheckService, { check: checks.check }, 'AccessCheck'),
    sessionDelegatedTransactions: () =>
      serviceOf(SessionDelegatedTransactionsService, delegated, 'DelegatedTransactions'),
    sessionPrincipals: () =>
      serviceOf(
        SessionInternalPrincipalsService,
        { coordinator: 'system:coordinator', maintainer: 'system:maintainer' },
        'InternalPrincipals',
      ),
    sessionWorkPrincipals: () =>
      serviceOf(SessionWorkPrincipalsService, workPrincipals, 'WorkPrincipals'),
    assemblyLifecycle: () => lifecycleService(handles, log),
    sessionTransactions: () =>
      serviceOf(SessionTransactionPortService, publicPort, 'TransactionPort'),
    sessionIdentity: () => serviceOf(SessionIdentityBridgeService, identity, 'IdentityBridge'),
    sessionEvidence: () =>
      serviceOf(SessionEvidenceBridgeService, evidenceBridge, 'EvidenceBridge'),
    sessionContextInput: () => serviceOf(SessionContextInputService, context, 'ContextInput'),
    sessionIdleInput: () => serviceOf(SessionIdleInputService, idle, 'IdleInput'),
    sessionClock: () => serviceOf(SessionClockService, clock, 'Clock'),
    sessionNotifier: () => serviceOf(SessionNotifierService, notifier, 'Notifier'),
    sessionAgentDrive: () =>
      serviceOf(
        AgentDrivePortService,
        {
          ...drive,
          invoke: (input: Parameters<typeof drive.invoke>[0]) => {
            hooks.invoked.push(input)
            return drive.invoke(input)
          },
        },
        'AgentDrive',
      ),
    sessionScopeRelease: () => serviceOf(ScopeReleasePortService, scopeRelease, 'ScopeRelease'),
  }

  const fibers: Partial<Record<PortName, Fiber>> = {}
  const plug = ctx.plugin as unknown as (
    plugin: unknown,
    config?: unknown,
  ) => Fiber & PromiseLike<Fiber>
  const mount = async (plugin: unknown): Promise<Fiber> => {
    const fiber = await plug(plugin)
    mounted.push(fiber)
    return fiber
  }

  const provide = async (name: PortName, implementation?: Constructible): Promise<Fiber> => {
    const fiber = await mount(implementation ?? providers[name]())
    fibers[name] = fiber
    return fiber
  }
  const withdraw = async (name: PortName): Promise<void> => {
    await fibers[name]?.dispose()
    delete fibers[name]
  }

  const sources = await mount(sessionInputSourcesPlugin)
  await mount({
    name: 'testing-input-sources',
    inject: [sessionInputSourcesKey],
    apply: (inner: Context) => {
      for (const declaration of TESTING_DECLARATIONS)
        inner.sessionInputSources.register(declaration)
    },
  })
  const omitted = new Set<PortName>(options.omit ?? [])
  for (const name of [...INJECTED, ...READ_PER_CALL]) if (!omitted.has(name)) await provide(name)

  let provider: Fiber | undefined
  const load = async (config?: unknown): Promise<Fiber> => {
    const wrapped = plug(options.plugin ?? SessionProvider, config)
    const fiber = Object.getPrototypeOf(wrapped) as Fiber
    mounted.push(fiber)
    provider = fiber
    await fiber.await().catch(() => undefined)
    return fiber
  }
  if (options.provider !== false) await load(options.provider ?? { admission: 'none' })

  const caller = async (
    callerClass: SessionCallerClass | 'unset' | string,
  ): Promise<{ ctx(): Context; session(): SessionService<unknown>; runs(): number }> => {
    let seen: Context | undefined
    let runs = 0
    await mount({
      name: `caller-${callerClass}`,
      inject: callerClass === 'unset' ? ['session'] : { session: { caller: callerClass } },
      apply: (inner: Context) => {
        seen = inner
        runs += 1
      },
    })
    return {
      runs: () => runs,
      ctx: () => {
        if (seen === undefined) throw new Error('the caller plugin has not run')
        return seen
      },
      session: () => {
        if (seen === undefined) throw new Error('the caller plugin has not run')
        return seen.session
      },
    }
  }

  const access = (session = 'session-1'): SessionAccess<string> => memoryAccess('a:tester', session)
  const other = (session = 'session-1'): SessionAccess<string> =>
    memoryOtherAccess('b:stranger', session)

  const create = async (
    intake: { session(): SessionService<unknown> },
    session = 'session-1',
    as: (session?: string) => SessionAccess<string> = access,
  ): Promise<CommitReceipt> =>
    succeeded(
      await intake.session().management.create({
        ...as(session),
        operation: operationId(`create-${session}`),
        creation: creation(),
      }),
      `create ${session}`,
    ).receipt

  const accept = async (
    intake: { session(): SessionService<unknown> },
    input: string,
    session = 'session-1',
    text?: string,
  ): Promise<CommitReceipt> =>
    succeeded(
      await intake.session().work.accept({
        ...access(session),
        operation: operationId(`accept-${input}`),
        value: ordinaryInput(input, text),
      }),
      `accept ${input}`,
    )

  const hold = () => {
    let release!: () => void
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    let reached!: () => void
    const arrived = new Promise<void>(resolve => {
      reached = resolve
    })
    hooks.beforeCommit = async () => {
      hooks.beforeCommit = null
      reached()
      await gate
    }
    return { release, arrived }
  }

  const mountStorageRow = async (close: () => Promise<void> = () => Promise.resolve()) => {
    await mount({
      name: 'fake-session-storage',
      inject: [LIFECYCLE_KEY],
      apply: (inner: Context) => {
        const lifecycle = inner.get(LIFECYCLE_KEY) as { register(handle: object): void }
        lifecycle.register({
          phase: 'composition',
          row: 'session-storage',
          start: () => Promise.resolve(),
          stop: async () => {
            log.push('storage-closing')
            await close()
            log.push('storage-closed')
            return { kind: 'settled' }
          },
        })
      },
    })
  }

  const emitCommitted = (...payload: unknown[]): void => {
    ;(ctx.emit as unknown as (...args: unknown[]) => void)(
      'session-cordis-contract/committed',
      ...payload,
    )
  }

  const events: unknown[][] = []
  const listen = async (listener?: () => void): Promise<void> => {
    await mount({
      name: 'listener',
      apply: (inner: Context) => {
        inner.on('session-cordis-contract/committed', (...payload: unknown[]) => {
          events.push(payload)
          listener?.()
        })
      },
    })
  }

  return {
    ctx,
    backend,
    checks,
    hooks,
    bindings,
    workPrincipals,
    notifier,
    drive,
    clock,
    handles,
    log,
    events,
    emitCommitted,
    hold,
    mountStorageRow,
    fibers,
    sources,
    get provider(): Fiber {
      if (provider === undefined) throw new Error('the provider was not loaded')
      return provider
    },
    load,
    mount,
    provide,
    withdraw,
    providers,
    listen,
    caller,
    access,
    other,
    create,
    accept,
    tenant: TENANT_A,
    sessionId,
    shutdown: () => shutdown(handles, log),
    close: async () => {
      for (const fiber of mounted.splice(0).reverse()) {
        try {
          await fiber.dispose()
        } catch {}
      }
      unregister()
      await backend.dispose()
    },
  }
}

export type Assembly = Awaited<ReturnType<typeof assemble>>
