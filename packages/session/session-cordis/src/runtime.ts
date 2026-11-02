// What one load of the plugin builds: the dependencies of the factory over the plugin's own
// Context, the instance, the combined notifier, the listener of foreign notices, the scanner table
// and the removal with its two triggers. The class in `provider.ts` only exposes the faces of it.
import type { Context } from '@deepseek-ai/cordis'
import { createSessionInstance, type SessionDependencies } from '@omne-harness/session'
import type {
  SessionCallerClass,
  SessionFaces,
  SessionNotifier,
} from '@omne-harness/session-contract'
import {
  assemblyLifecycleKey,
  sessionProviderRow,
  type AssemblyLifecycle,
} from './assembly-lifecycle.ts'
import type { ResolvedProviderConfig } from './config.ts'
import { describe, diagnoser } from './diagnostics.ts'
import { deniedFaces, removedFaces } from './faces.ts'
import { createPorts } from './ports.ts'
import { createScanners } from './scanners.ts'
import { createTeardown, type Teardown } from './teardown.ts'

const COMMITTED = 'session-cordis-contract/committed'

export type ProviderRuntime = Readonly<{
  /** The faces a caller of that class sees; null is a caller whose class is unknown. */
  facesFor(caller: SessionCallerClass | null): SessionFaces<unknown>
  /** The removal. Both triggers call it; the steps run once. */
  teardown: Teardown
}>

/** Builds the instance and wires every effect of the plugin on `ctx`. Call it from the plugin body. */
export function startProvider(ctx: Context, config: ResolvedProviderConfig): ProviderRuntime {
  const diagnose = diagnoser(ctx)
  let removing = false

  type Notice = Parameters<SessionNotifier['committed']>[0]
  // The kinds array of a notice that this plugin dispatched itself, by identity: the instance
  // already knows its own commit, so the listener skips it. Skipping is an optimization only.
  const dispatched = new WeakSet<object>()

  /** Hands the notice on to the sessionNotifier, when there is one. */
  const forward = async (notice: Notice): Promise<void> => {
    const target = ctx.get('sessionNotifier')
    if (target === undefined) return
    try {
      await target.committed(notice)
    } catch (error) {
      diagnose(`sessionNotifier failed: ${describe(error)}`)
    }
  }

  const notifier: SessionNotifier = {
    committed: async notice => {
      // A commit that completes during removal sends no notice. The next instance finds the work by scan.
      if (removing) return
      dispatched.add(notice.kinds)
      try {
        // Not awaited: the commit path does not wait for listeners. The failure is caught here.
        ctx
          .parallel(
            COMMITTED,
            notice.tenant,
            notice.session,
            notice.revision,
            notice.source,
            notice.kinds,
          )
          .catch((error: unknown) => {
            diagnose(`a listener of ${COMMITTED} failed: ${describe(error)}`)
          })
      } catch (error) {
        diagnose(`dispatching ${COMMITTED} failed: ${describe(error)}`)
      }
      await forward(notice)
      scanners.bind(notice.tenant)
    },
  }

  const dependencies: SessionDependencies<unknown> = {
    ...createPorts(ctx, diagnose),
    // The four injected keys. A change of any of their providers reloads the plugin body.
    accessCheck: ctx.sessionAccessCheck,
    transactions: ctx.sessionDelegatedTransactions,
    principals: ctx.sessionPrincipals,
    workPrincipals: ctx.sessionWorkPrincipals,
    notifier: { current: () => notifier },
    admission: {
      // Without the declaration the slots have no key yet, so admission is unavailable.
      current: () => (config.admission === 'none' ? [] : null),
    },
  }
  const instance = createSessionInstance(dependencies, { policy: config.policy })
  const scanners = createScanners({ instance, removing: () => removing, diagnose })

  const teardown = createTeardown({
    mark: () => {
      removing = true
    },
    scanners,
    instance,
    disposeWaitMs: config.disposeWaitMs,
    diagnose,
  })

  // Trigger 1 of the removal: the fiber unloads (removal of the plugin, or a provider change).
  ctx.effect(
    () => async () => {
      await teardown()
    },
    'session-provider.teardown',
  )

  // A notice from another dispatcher wakes the instance. The listener runs synchronously.
  ctx.on(COMMITTED, (tenant, session, revision, source, kinds) => {
    if (removing || dispatched.has(kinds)) return
    try {
      instance.committed({ tenant, session, revision, source, kinds })
      scanners.bind(tenant)
    } catch (error) {
      diagnose(`handling a foreign notice failed: ${describe(error)}`)
    }
  })

  // Trigger 2: the ordered shutdown stops this row before it stops the storage rows.
  const lifecycle = ctx.get(assemblyLifecycleKey) as AssemblyLifecycle | undefined
  if (lifecycle === undefined) throw new Error(`${assemblyLifecycleKey} is not available`)
  lifecycle.register({
    phase: 'business',
    row: sessionProviderRow,
    // The instance is built and serving when the plugin body ran, so starting has nothing to do.
    start: () => Promise.resolve(),
    stop: () => teardown(),
  })

  const denied = deniedFaces(instance.facesFor('reader'))
  const removed = removedFaces(instance.facesFor('reader'))
  return {
    facesFor: caller => {
      if (removing) return removed
      return caller === null ? denied : instance.facesFor(caller)
    },
    teardown,
  }
}
