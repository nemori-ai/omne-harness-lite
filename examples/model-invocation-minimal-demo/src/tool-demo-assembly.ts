import type { Context, Fiber } from '@deepseek-ai/cordis'
import { FIBER_STATE } from '@omne-harness-lite/kernel-basis/cordis'
import {
  toolAdmissionLocal,
  officialAdmission,
} from '@omne-harness-lite/tool-admission-local/cordis'
import { ToolActionHistoryService } from '@omne-harness-lite/tool-admission/cordis'
import { ResourceRecoveryAuthorityService } from '@omne-harness-lite/execution-environments/cordis'
import type {
  RecoveryAccess,
  ResourceRecoveryAuthority,
} from '@omne-harness-lite/execution-environments'
import type { SessionLogOwnerOperations } from '@omne-harness-lite/session-log'
import type { ToolRuntimeConfig } from '@omne-harness-lite/tool-execution-runtime'
import { environmentRegistry } from '@omne-harness-lite/execution-environments-host/cordis'
import {
  runtimeRegistry,
  implementationRegistry,
  toolExecutionLocal,
} from '@omne-harness-lite/tool-execution-local/cordis'
import { toolResultFiles } from '@omne-harness-lite/tool-result-files/cordis'
import { toolActionHistory } from './tool-driver-history.ts'
import { demoPureTools } from './demo-tools.cordis.ts'

class History extends ToolActionHistoryService {
  constructor(ctx: Context) {
    super(ctx)
  }
  inspect(...args: Parameters<typeof toolActionHistory.inspect>) {
    return toolActionHistory.inspect(...args)
  }
}
class Maintenance extends ResourceRecoveryAuthorityService {
  constructor(
    ctx: Context,
    private readonly owner: SessionLogOwnerOperations,
  ) {
    super(ctx)
  }
  async authorizeRecovery(
    ...[access, scope]: Parameters<ResourceRecoveryAuthority['authorizeRecovery']>
  ): ReturnType<ResourceRecoveryAuthority['authorizeRecovery']> {
    const result = await this.owner.readPrefix(access, scope)
    return result.kind === 'prefix'
      ? 'authorized'
      : result.reason === 'notAuthorized' || result.reason === 'invalidInput'
        ? 'notAuthorized'
        : 'unavailable'
  }
}

/** Install the concrete providers under the application's lifetime; JSON config carries no live tokens. */
export async function installDemoTools(input: {
  readonly ctx: Context
  readonly owner: SessionLogOwnerOperations
  readonly recovery: RecoveryAccess
  readonly directory: string
  readonly config: ToolRuntimeConfig
}) {
  const fibers: Fiber[] = []
  let officialFiber: Fiber | undefined
  async function active(fiber: Fiber) {
    fibers.push(fiber)
    await fiber
    if (fiber.state !== FIBER_STATE.ACTIVE) throw new Error('demo tool provider unavailable')
  }
  try {
    await active(
      input.ctx.plugin({
        name: 'demo-tool-owned-inputs',
        apply(ctx: Context) {
          new History(ctx)
          new Maintenance(ctx, input.owner)
        },
      }),
    )
    await active(input.ctx.plugin(runtimeRegistry, {}))
    await active(input.ctx.plugin(implementationRegistry, {}))
    await active(input.ctx.plugin(environmentRegistry, {}))
    await active(
      input.ctx.plugin(toolResultFiles, {
        directory: input.directory,
        storage: input.config.resultStorage,
      }),
    )
    await active(input.ctx.plugin(toolAdmissionLocal, {}))
    officialFiber = input.ctx.plugin(officialAdmission, {})
    await active(officialFiber)
    await active(input.ctx.plugin(demoPureTools, {}))
    await active(input.ctx.plugin(toolExecutionLocal({ recovery: input.recovery }), input.config))
    return Object.freeze({
      fibers,
      officialAdmission: officialFiber,
      async close() {
        for (const fiber of [...fibers].reverse()) await fiber.dispose()
      },
    })
  } catch (error) {
    // Disposal failure retains the fibers under their real application Context for another close.
    await Promise.allSettled([...fibers].reverse().map(fiber => fiber.dispose()))
    throw error
  }
}
