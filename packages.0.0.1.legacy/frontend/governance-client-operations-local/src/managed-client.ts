import type { Context } from '@deepseek-ai/cordis'
import {
  ASSEMBLY_LIFETIME_SERVICE,
  startAssemblyWork,
} from '@omne-harness-lite/assembly-lifecycle/cordis'
import { CLIENT_LOCAL_STATE_SERVICE } from '@omne-harness-lite/client-local-state/cordis'
import { GOVERNANCE_TRANSPORT_SERVICE } from '@omne-harness-lite/governance-center-entry-https-json/cordis'
import type { GovernanceClientOperations } from '@omne-harness-lite/governance-client-operations'
import { GOVERNANCE_CLIENT_CLOSE_OBSERVER_SERVICE } from '@omne-harness-lite/governance-client-operations/cordis'
import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import { createGovernanceClient } from './client.ts'
import { ClientService, governanceClientConfig, type GovernanceClientConfig } from './plugin.ts'

/** Internal construction seam for faults at pure close and service publication. */
export function createManagedClientBinding(dependencies: {
  readonly create: typeof createGovernanceClient
  readonly publish: (ctx: Context, client: GovernanceClientOperations) => void
}) {
  return Object.assign(
    definePlugin<GovernanceClientConfig>({
      name: 'governance-client-operations-local-managed',
      inject: [
        CLIENT_LOCAL_STATE_SERVICE,
        GOVERNANCE_TRANSPORT_SERVICE,
        GOVERNANCE_CLIENT_CLOSE_OBSERVER_SERVICE,
        ASSEMBLY_LIFETIME_SERVICE,
      ],
      Config: governanceClientConfig,
      apply(ctx, config) {
        const attempt = Promise.withResolvers<void>()
        const logger = ctx.logger('governance-client-operations-local')
        let client: GovernanceClientOperations | undefined
        let started = false
        // A rejected business close grants no quiescence permission to the coordinator.
        const quiet = attempt.promise.catch(() => new Promise<void>(() => {}))
        // Diagnostic failure must not grant permission to release dependencies.
        void attempt.promise.catch(() => logger.error('client-close-failed')).catch(() => undefined)
        const close = (): Promise<void> => {
          if (started) return attempt.promise
          started = true
          try {
            attempt.resolve(client?.close())
          } catch (error) {
            attempt.reject(error)
          }
          return attempt.promise
        }
        startAssemblyWork(
          ctx,
          async () => {
            ctx.governanceClientCloseObserver.observe(attempt.promise)
            client = dependencies.create({
              state: ctx.clientLocalState,
              transport: ctx.governanceTransport,
              ...config,
            })
            const owned = client
            dependencies.publish(ctx, {
              runAction: input => owned.runAction(input),
              runPrepared: (input, prompt) => owned.runPrepared(input, prompt),
              openUse: () => owned.openUse(),
              close,
            })
          },
          () => {
            void close()
            return quiet
          },
        )
      },
    }),
    { assemblyLifecycle: 1 as const },
  )
}

export const managedGovernanceClientOperationsPlugin = createManagedClientBinding({
  create: createGovernanceClient,
  publish: (ctx, client) => {
    new ClientService(ctx, client)
  },
})
