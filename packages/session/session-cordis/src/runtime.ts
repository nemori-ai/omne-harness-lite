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
const TENANTS = 'sessionTenants'

export type ProviderRuntime = Readonly<{
  facesFor(caller: SessionCallerClass | null): ProviderFaces
  teardown: Teardown
}>

export function startProvider(
  ctx: Context,
  config: ResolvedProviderConfig,
  observers: SessionInstanceOptions = {},
): ProviderRuntime {
  const diagnose = diagnoser(ctx)
  let removing = false

  const dependencies: SessionDependencies<unknown> = {
    ...createPorts(ctx, diagnose),
    accessCheck: ctx.sessionAccessCheck,
    transactions: ctx.sessionDelegatedTransactions,
    principals: ctx.sessionPrincipals,
    workPrincipals: ctx.sessionWorkPrincipals,
    admission: {
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

  ctx.effect(
    () => async () => {
      await teardown()
    },
    'session-provider.teardown',
  )

  ctx.on(COMMITTED, (tenant, session, revision, source, kinds) => {
    if (removing) return
    try {
      instance.committed({ tenant, session, revision, source, kinds })
      scanners.bind(tenant)
    } catch (error) {
      diagnose(`handling a commit notice failed: ${describe(error)}`)
    }
  })

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

  const lifecycle = ctx.get(assemblyLifecycleKey) as AssemblyLifecycle | undefined
  if (lifecycle === undefined) throw new Error(`${assemblyLifecycleKey} is not available`)
  lifecycle.register({
    phase: 'business',
    row: sessionProviderRow,
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
