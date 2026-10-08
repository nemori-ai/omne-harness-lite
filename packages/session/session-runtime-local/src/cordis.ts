import { Context, type Fiber } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { definePlugin, FIBER_STATE } from '@omne-harness-lite/kernel-basis/cordis'
import {
  createAssemblyLifetime,
  type AssemblyCloseReport,
} from '@omne-harness-lite/assembly-lifecycle'
import { createRuntimeContextLocal } from '@omne-harness-lite/runtime-context-local/cordis'
import { RUNTIME_CONTEXT } from '@omne-harness-lite/runtime-context/cordis'
import { InvalidStateInput, stateScope } from './state-values.ts'
import { installSessionBridges, sameScope } from './session-context-bridges.ts'
import type { SessionContextOptions, LocalSessionContext } from './session-context-types.ts'

/** Separate Session Context with explicit borrowed references. No parent process Context is shared. */
export function createLocalSessionContext(requested: SessionContextOptions): LocalSessionContext {
  const options = Object.freeze({ ...requested, scope: stateScope(requested.scope) })
  const context = new Context(),
    factory = createRuntimeContextLocal()
  const lifetime = createAssemblyLifetime(['runtimeContext'], factory.closeAdmission)
  if (!lifetime.tryClaim()) throw new Error('Fresh Session Context could not be claimed')
  let host: Fiber | undefined, hostContext: Context | undefined
  const closed = lifetime.closed.then(async report => {
    try {
      await host?.dispose()
    } catch {
      return failedDisposal(report)
    }
    return report
  })
  const ready = load()
  void ready.catch(() => {
    void lifetime.close()
  })
  void closed.catch(() => undefined)
  async function load() {
    host = context.plugin(
      definePlugin({
        name: 'session-context-host',
        Config: z.object({}).strict(),
        apply(ctx) {
          installSessionBridges(ctx, options, lifetime.port('runtimeContext'))
          hostContext = ctx
        },
      }),
      {},
    )
    await host
    if (!lifetime.isCurrent() || !hostContext)
      throw new Error('Session Context stopped before setup')
    const fiber = hostContext.plugin(factory.plugin, {})
    if ((fiber.state as number) === FIBER_STATE.PENDING)
      throw new Error('Session Context dependency missing')
    await fiber
    await factory.ready
    if (!lifetime.isCurrent()) throw new Error('Session Context stopped during setup')
    const operations = hostContext.get(RUNTIME_CONTEXT)
    if (!operations) throw new Error('Session Runtime Context was not provided')
    return operations
  }
  const initializer: LocalSessionContext['initializer'] = Object.freeze<
    LocalSessionContext['initializer']
  >({
    initializeContextSession: (scope, seed) => {
      if (!lifetime.isCurrent())
        return Promise.resolve({ kind: 'rejected', reason: 'ownerStopped' } as const)
      let owned
      try {
        owned = stateScope(scope)
      } catch (error) {
        if (!(error instanceof InvalidStateInput)) throw error
        return Promise.resolve({ kind: 'rejected', reason: 'invalidInput' } as const)
      }
      if (!sameScope(options.scope, owned))
        return Promise.resolve({ kind: 'rejected', reason: 'notAuthorized' } as const)
      return factory.initializer.initializeContextSession(owned, seed)
    },
  })
  async function closeAttempt(retry: boolean) {
    if (lifetime.isCurrent()) return 'notStopping' as const
    const control = lifetime.closeControl('runtimeContext')
    if (control) return retry ? control.retryClose() : control.closeAttempt()
    const report = await closed
    return report.complete ? ('closed' as const) : ('retained' as const)
  }
  return Object.freeze({
    scope: options.scope,
    ready,
    initializer,
    requestStop: () => {
      void lifetime.close()
    },
    closed,
    closeAttempt: () => closeAttempt(false),
    retryClose: () => closeAttempt(true),
  })
}
function failedDisposal(report: AssemblyCloseReport): AssemblyCloseReport {
  return {
    ...report,
    complete: false,
    assemblyErrors: [...report.assemblyErrors, 'assembly-fiber-dispose-failed'],
  }
}
export type { SessionContextOptions, LocalSessionContext } from './session-context-types.ts'
