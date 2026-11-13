// What one load of the plugin builds: the dependencies of the factory over the plugin's own
// Context, the instance, the listener of the commit notices, the scanner table and the removal with
// its two triggers. The class in `provider.ts` only exposes the faces of it. The plugin dispatches
// no notice: the one writer of the session log tells each batch (`createSessionCommitNotifier`).
import type { Context } from '@deepseek-ai/cordis'
import {
  createSessionInstance,
  type SessionDependencies,
  type SessionInstanceOptions,
} from '@omne-harness/session'
import type { SessionCallerClass } from '@omne-harness/session-contract'
import {
  assemblyLifecycleKey,
  sessionProviderRow,
  type AssemblyLifecycle,
} from './assembly-lifecycle.ts'
import type { ResolvedProviderConfig } from './config.ts'
import { describe, diagnoser } from './diagnostics.ts'
import { deniedFaces, removedFaces, type ProviderFaces } from './faces.ts'
import { createPorts } from './ports.ts'
import { createScanners } from './scanners.ts'
import { createTeardown, type Teardown } from './teardown.ts'

const COMMITTED = 'session-cordis-contract/committed'
/** The key of the deployment's tenant source (session-cordis-contract `sessionTenantsKey`). */
const TENANTS = 'sessionTenants'

export type ProviderRuntime = Readonly<{
  /** The faces a caller of that class sees; null is a caller whose class is unknown. */
  facesFor(caller: SessionCallerClass | null): ProviderFaces
  /** The removal. Both triggers call it; the steps run once. */
  teardown: Teardown
}>

/** Builds the instance and wires every effect of the plugin on `ctx`. Call it from the plugin body. */
export function startProvider(
  ctx: Context,
  config: ResolvedProviderConfig,
  observers: SessionInstanceOptions = {},
): ProviderRuntime {
  const diagnose = diagnoser(ctx)
  let removing = false

  const dependencies: SessionDependencies<unknown> = {
    ...createPorts(ctx, diagnose),
    // The four injected keys. A change of any of their providers reloads the plugin body.
    accessCheck: ctx.sessionAccessCheck,
    transactions: ctx.sessionDelegatedTransactions,
    principals: ctx.sessionPrincipals,
    workPrincipals: ctx.sessionWorkPrincipals,
    admission: {
      // Without the declaration the slots have no key yet, so admission is unavailable.
      current: () => (config.admission === 'none' ? [] : null),
    },
  }
  const instance = createSessionInstance(dependencies, { policy: config.policy }, observers)
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

  // Every notice wakes the instance and signals the scanner of its tenant, which starts one when the
  // tenant has none (session SPEC「扫描者的生灭」), whichever committer wrote the batch: a batch of
  // a command of this instance too, which then wakes it once more. A wake
  // only reads; it commits nothing that the log does not ask for. The listener runs synchronously.
  ctx.on(COMMITTED, (tenant, session, revision, source, kinds) => {
    if (removing) return
    try {
      instance.committed({ tenant, session, revision, source, kinds })
      scanners.bind(tenant)
    } catch (error) {
      diagnose(`handling a commit notice failed: ${describe(error)}`)
    }
  })

  /**
   * The startup scan over the deployment's tenants (SPEC property 7). Without the source, or when
   * it does not answer, this start binds scanners from the notices only, and says so.
   */
  const bindDeployedTenants = async (): Promise<void> => {
    const source = ctx.get(TENANTS)
    if (source === undefined) {
      diagnose(`${TENANTS} is absent; scanners are bound from notices only`)
      return
    }
    try {
      const listed = await source.enumerate()
      if ('failure' in listed) {
        diagnose(
          `${TENANTS} answered ${listed.failure.kind}: ${listed.failure.diagnostic}; scanners are bound from notices only`,
        )
        return
      }
      for (const tenant of listed.ok) if (!removing) scanners.bind(tenant)
    } catch (error) {
      diagnose(`${TENANTS} threw: ${describe(error)}; scanners are bound from notices only`)
    }
  }

  // Trigger 2: the ordered shutdown stops this row before it stops the storage rows.
  const lifecycle = ctx.get(assemblyLifecycleKey) as AssemblyLifecycle | undefined
  if (lifecycle === undefined) throw new Error(`${assemblyLifecycleKey} is not available`)
  lifecycle.register({
    phase: 'business',
    row: sessionProviderRow,
    // The instance is built and serving when the plugin body ran. Starting binds a scanner for
    // each tenant of the deployment, so a tenant with work and no new commit is scanned too.
    start: () => bindDeployedTenants(),
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
