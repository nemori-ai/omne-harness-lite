import type { Context } from '@deepseek-ai/cordis'
import { definePlugin, fiberIsActive } from '@omne-harness-lite/kernel-basis'
import { SESSION_LOG } from '@omne-harness-lite/session-log/cordis'
import { LoopExtensionRunnerService, LoopExtensionImplementationsService, RUNNER_HOST } from '@omne-harness-lite/loop-extension-runner/cordis'
import type { LoopExtensionRunnerService as RunnerOperations, RunnerImplementations } from '@omne-harness-lite/loop-extension-runner'
import { z } from 'zod'
import { createLoopExtensionRunner } from './service.ts'

class Runner extends LoopExtensionRunnerService {
  constructor(ctx: Context, private readonly operations: RunnerOperations) { super(ctx) }
  dispatch(...args: Parameters<RunnerOperations['dispatch']>) { return this.operations.dispatch(...args) }
  replay(...args: Parameters<RunnerOperations['replay']>) { return this.operations.replay(...args) }
}
class Implementations extends LoopExtensionImplementationsService {
  constructor(ctx: Context, private readonly operations: RunnerImplementations) { super(ctx) }
  registerBuiltin(...args: Parameters<RunnerImplementations['registerBuiltin']>) {
    const dispose = this.ctx.effect(() => this.operations.registerBuiltin(...args))
    return () => { void dispose() }
  }
}
export const loopExtensionRunnerPlugin = definePlugin({
  name: 'loop-extension-runner-local',
  inject: [SESSION_LOG, RUNNER_HOST],
  Config: z.object({}).strict(),
  apply(ctx) {
    const owner = ctx
    const instance = createLoopExtensionRunner({ log: ctx.sessionLog, host: ctx.runnerHost, isActive: () => fiberIsActive(owner) })
    ctx.effect(() => async () => { instance.closeAdmission(); await instance.drain() }, 'loop-extension-runner.close')
    new Runner(ctx, instance.runner)
    new Implementations(ctx, instance.implementations)
  },
})
