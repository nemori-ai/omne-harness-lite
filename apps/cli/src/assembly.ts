import { Context, type Fiber, type Plugin } from '@deepseek-ai/cordis'
import {
  createAssemblyLifetime,
  AssemblyWorkStopped,
  type AssemblyLifetimePort,
  type OwnedWork,
  type LifetimeRegistration,
  type AssemblyCloseReport,
} from '@omne-harness-lite/assembly-lifecycle'
import {
  AssemblyLifetimeService,
  startAssemblyWork,
} from '@omne-harness-lite/assembly-lifecycle/cordis'
import {
  ClientStateStorage,
  CLIENT_LOCAL_STATE_SERVICE,
} from '@omne-harness-lite/client-local-state/cordis'
import { ClientStateOpenFailure } from '@omne-harness-lite/client-local-state-sqlite'
import { managedClientLocalStatePlugin } from '@omne-harness-lite/client-local-state-sqlite/cordis'
import { GOVERNANCE_TRANSPORT_SERVICE } from '@omne-harness-lite/governance-center-entry-https-json/cordis'
import { managedGovernanceTransportPlugin } from '@omne-harness-lite/governance-center-client-https/cordis'
import type { GovernanceClientOperations } from '@omne-harness-lite/governance-client-operations'
import {
  GovernanceClientCloseObserver,
  GOVERNANCE_CLIENT_OPERATIONS_SERVICE,
} from '@omne-harness-lite/governance-client-operations/cordis'
import { managedGovernanceClientOperationsPlugin } from '@omne-harness-lite/governance-client-operations-local/cordis'
import { openStorage } from '@omne-harness-lite/storage-sql'
import { FIBER_STATE } from '@omne-harness-lite/kernel-basis/cordis'
import {
  ClientAssemblyStateFailure,
  ClientAssemblyStopped,
  type ClientAssembly,
  type ClientAssemblyOptions,
} from './client-assembly.ts'

class StorageFactory extends ClientStateStorage {
  open = (file: string) => openStorage({ dialect: 'sqlite', file, synchronous: 'full' })
}
const storageBinding = {
  name: 'cli-state-storage',
  assemblyLifecycle: 1 as const,
  inject: ['assemblyLifetime'],
  apply(ctx: Context) {
    startAssemblyWork(
      ctx,
      async () => {
        new StorageFactory(ctx)
      },
      async () => {},
    )
  },
}
class LifetimePort extends AssemblyLifetimeService {
  constructor(
    ctx: Context,
    private readonly port: AssemblyLifetimePort,
  ) {
    super(ctx)
  }
  isCurrent = () => this.port.isCurrent()
  register = (work: OwnedWork) => this.port.register(work)
}
class CloseObserver extends GovernanceClientCloseObserver {
  constructor(
    ctx: Context,
    private readonly receive: (attempt: Promise<void>) => void,
  ) {
    super(ctx)
  }
  observe = (attempt: Promise<void>) => this.receive(attempt)
}
const ids = ['storage', 'localState', 'transport', 'client'] as const
type RowId = (typeof ids)[number]
type ManagedBinding = Plugin & { readonly assemblyLifecycle: 1 }
/** Private application composition seam; never CLI options or a public tree protocol. */
export type ClientAssemblyBindings = Partial<Record<RowId, ManagedBinding>>
const defaults: Record<RowId, ManagedBinding> = {
  storage: storageBinding,
  localState: managedClientLocalStatePlugin,
  transport: managedGovernanceTransportPlugin,
  client: managedGovernanceClientOperationsPlugin,
}
const provides: Record<RowId, string> = {
  storage: ClientStateStorage.provide,
  localState: CLIENT_LOCAL_STATE_SERVICE,
  transport: GOVERNANCE_TRANSPORT_SERVICE,
  client: GOVERNANCE_CLIENT_OPERATIONS_SERVICE,
}

/** The synchronous handle exists before the first provider effect can start. */
export function createClientAssembly(
  options: ClientAssemblyOptions,
  bindings: ClientAssemblyBindings = {},
): ClientAssembly {
  const context = new Context()
  const ready = Promise.withResolvers<GovernanceClientOperations>()
  const stopped = Promise.withResolvers<void>()
  const presentation = Promise.withResolvers<void>()
  void ready.promise.catch(() => undefined)
  void stopped.promise.catch(() => undefined)
  let client: GovernanceClientOperations | undefined
  let receipt: LifetimeRegistration | undefined
  let observed = false
  const lifetime = createAssemblyLifetime(ids, () => {
    // register cannot succeed after this synchronous stopping barrier.
    if (!receipt) stopped.resolve()
    else if (!observed)
      void receipt.closed.then(() => {
        if (!observed) stopped.resolve()
      })
    if (client) {
      try {
        void client.close().catch(() => undefined)
      } catch {
        /* The managed observer owns the original failure. */
      }
    }
  })
  if (!lifetime.tryClaim()) throw new Error('Fresh client assembly could not be claimed')
  const loaded: Fiber[] = [],
    ports: Fiber[] = []
  const errors = new Set<AssemblyCloseReport['assemblyErrors'][number]>()
  const closed = lifetime.closed.then(async report => {
    for (const fiber of loaded.reverse()) {
      try {
        await fiber.dispose()
      } catch {
        errors.add('assembly-fiber-dispose-failed')
      }
    }
    for (const fiber of ports.reverse()) {
      try {
        await fiber.dispose()
      } catch {
        errors.add('assembly-port-dispose-failed')
      }
    }
    return {
      ...report,
      complete: report.complete && errors.size === 0,
      assemblyErrors: [...new Set([...report.assemblyErrors, ...errors])],
    }
  })
  void closed.catch(() => undefined)
  const handle: ClientAssembly = {
    ready: ready.promise,
    requestStop() {
      void lifetime.close()
    },
    clientStopped: stopped.promise,
    releasePresentation() {
      presentation.resolve()
    },
    closed,
  }
  const assertCurrent = () => {
    if (!lifetime.isCurrent()) throw new ClientAssemblyStopped()
  }
  const invalidRow = (message: string): never => {
    errors.add('assembly-protocol-failed')
    throw new Error(message)
  }
  const load = async (id: RowId): Promise<void> => {
    assertCurrent()
    const plugin = bindings[id] ?? defaults[id]
    if (plugin.assemblyLifecycle !== 1) invalidRow('Client row requires a managed binding')
    const scope = context.isolate(AssemblyLifetimeService.provide)
    const port = lifetime.port(id)
    let rowReady: Promise<void> | undefined
    const bridge = scope.plugin(ctx => {
      new LifetimePort(ctx, {
        isCurrent: () => port.isCurrent(),
        register(work) {
          const owned: OwnedWork =
            id === 'localState'
              ? {
                  ready: work.ready,
                  async close() {
                    await presentation.promise
                    await work.close()
                  },
                }
              : work
          const registered = port.register(owned)
          // No await or callback may separate registration from the app's receipt.
          if (id === 'client') receipt = registered
          rowReady = work.ready
          void rowReady.catch(() => undefined)
          return registered
        },
      })
      if (id === 'client')
        new CloseObserver(ctx, attempt => {
          if (observed) throw new Error('Client close observation already established')
          observed = true
          // Observe immediately, including an arrival while receipt.closed is pending.
          attempt.then(stopped.resolve, stopped.reject)
        })
    })
    ports.push(bridge)
    await bridge
    assertCurrent()
    const config =
      id === 'localState'
        ? { directory: options.directory }
        : id === 'client' && options.timeoutMs !== undefined
          ? { timeoutMs: options.timeoutMs }
          : {}
    let fiber: Fiber
    try {
      fiber = scope.plugin(plugin, config)
    } catch (error) {
      errors.add('assembly-protocol-failed')
      throw error
    }
    loaded.push(fiber)
    if ((fiber.state as number) === FIBER_STATE.PENDING)
      invalidRow('A client row dependency is missing')
    try {
      await fiber
    } catch (error) {
      if (!rowReady) errors.add('assembly-protocol-failed')
      throw error
    }
    if (!rowReady) invalidRow('Client row did not register its owned work')
    await rowReady
    assertCurrent()
    if ((fiber.state as number) !== FIBER_STATE.ACTIVE || !scope.get(provides[id]))
      invalidRow('Client row is not ready and active')
    if (id === 'client') client = scope.governanceClientOperations
  }
  // Start only after returning the handle; all setup failures retain their real prefix.
  void Promise.resolve()
    .then(async () => {
      for (const id of ids) await load(id)
      assertCurrent()
      ready.resolve(client!)
    })
    .catch(error => {
      handle.requestStop()
      ready.reject(
        error instanceof ClientStateOpenFailure
          ? new ClientAssemblyStateFailure(error.reason)
          : error instanceof AssemblyWorkStopped
            ? new ClientAssemblyStopped()
            : error,
      )
    })
  return handle
}
