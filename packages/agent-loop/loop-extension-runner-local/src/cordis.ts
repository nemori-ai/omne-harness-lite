import { isActionDispatch } from './action-request.ts'
import type { Context } from '@deepseek-ai/cordis'
import { definePlugin, fiberIsActive } from '@omne-harness-lite/kernel-basis'
import { SESSION_LOG } from '@omne-harness-lite/session-log/cordis'
import { SESSION_ACCESS } from '@omne-harness-lite/session-tenancy/cordis'
import { ToolAdmissionPassSourceService } from '@omne-harness-lite/tool-admission/cordis'
import type { ToolAdmissionPassSourceOperations } from '@omne-harness-lite/tool-admission'
import {
  LoopExtensionRunnerService,
  LoopExtensionImplementationsService,
  RUNNER_HOST,
} from '@omne-harness-lite/loop-extension-runner/cordis'
import type {
  LoopExtensionRunnerService as RunnerOperations,
  RunnerImplementations,
  RunnerDispatchRequest,
  RunnerActionRequest,
  RunnerPassResult,
  RunnerActionResult,
} from '@omne-harness-lite/loop-extension-runner'
import { z } from 'zod'
import { createLoopExtensionRunner } from './service.ts'

class Runner extends LoopExtensionRunnerService {
  constructor(
    ctx: Context,
    private readonly operations: RunnerOperations,
  ) {
    super(ctx)
  }
  dispatch(request: RunnerDispatchRequest, signal: AbortSignal): Promise<RunnerPassResult>
  dispatch(request: RunnerActionRequest, signal: AbortSignal): Promise<RunnerActionResult>
  dispatch(
    request: RunnerDispatchRequest | RunnerActionRequest,
    signal: AbortSignal,
  ): Promise<RunnerPassResult | RunnerActionResult> {
    return isActionDispatch(request)
      ? this.operations.dispatch(request as RunnerActionRequest, signal)
      : this.operations.dispatch(request as RunnerDispatchRequest, signal)
  }
  replay(...args: Parameters<RunnerOperations['replay']>) {
    return this.operations.replay(...args)
  }
}
class Implementations extends LoopExtensionImplementationsService {
  constructor(
    ctx: Context,
    private readonly operations: RunnerImplementations,
  ) {
    super(ctx)
  }
  registerBuiltin(...args: Parameters<RunnerImplementations['registerBuiltin']>) {
    const dispose = this.ctx.effect(() => this.operations.registerBuiltin(...args))
    return () => {
      void dispose()
    }
  }
  registerAdmission(...args: Parameters<RunnerImplementations['registerAdmission']>) {
    const dispose = this.ctx.effect(() => this.operations.registerAdmission(...args))
    return () => {
      void dispose()
    }
  }
}
class AdmissionPassSource extends ToolAdmissionPassSourceService {
  constructor(
    ctx: Context,
    private readonly operations: ToolAdmissionPassSourceOperations,
  ) {
    super(ctx)
  }
  read(...args: Parameters<ToolAdmissionPassSourceOperations['read']>) {
    return this.operations.read(...args)
  }
}
export const loopExtensionRunnerPlugin = definePlugin({
  name: 'loop-extension-runner-local',
  inject: [SESSION_LOG, RUNNER_HOST, SESSION_ACCESS],
  Config: z.object({}).strict(),
  apply(ctx) {
    const owner = ctx
    const instance = createLoopExtensionRunner({
      log: ctx.sessionLog,
      host: ctx.runnerHost,
      access: ctx.sessionAccess,
      isActive: () => fiberIsActive(owner),
    })
    ctx.effect(
      () => async () => {
        instance.closeAdmission()
        await instance.drain()
      },
      'loop-extension-runner.close',
    )
    new Runner(ctx, instance.runner)
    new Implementations(ctx, instance.implementations)
    new AdmissionPassSource(ctx, instance.admissionPassSource)
  },
})
