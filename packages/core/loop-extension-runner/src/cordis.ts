import { Context, Service } from '@deepseek-ai/cordis'
import type { LoopExtensionRunnerService as Operations0, RunnerImplementations as Operations1, RunnerServiceHost as Operations2 } from './index.ts'

/** @contract capability.loop-extension-runner */
export abstract class LoopExtensionRunnerService extends Service implements Operations0 {
  static readonly provide = 'loopExtensionRunner'
  constructor(ctx: Context) { super(ctx, LoopExtensionRunnerService.provide) }
  abstract dispatch(...args: Parameters<Operations0['dispatch']>): ReturnType<Operations0['dispatch']>
  abstract replay(...args: Parameters<Operations0['replay']>): ReturnType<Operations0['replay']>
}
export const LOOP_EXTENSION_RUNNER = LoopExtensionRunnerService.provide

/** @contract capability.loop-extension-runner */
export abstract class LoopExtensionImplementationsService extends Service implements Operations1 {
  static readonly provide = 'loopExtensionImplementations'
  constructor(ctx: Context) { super(ctx, LoopExtensionImplementationsService.provide) }
  abstract registerBuiltin(...args: Parameters<Operations1['registerBuiltin']>): ReturnType<Operations1['registerBuiltin']>
}
export const LOOP_EXTENSION_IMPLEMENTATIONS = LoopExtensionImplementationsService.provide

/** @contract capability.loop-extension-runner */
export abstract class RunnerHostService extends Service implements Operations2 {
  static readonly provide = 'runnerHost'
  constructor(ctx: Context) { super(ctx, RunnerHostService.provide) }
  abstract acquireDispatch(...args: Parameters<Operations2['acquireDispatch']>): ReturnType<Operations2['acquireDispatch']>
  abstract acquireReplay(...args: Parameters<Operations2['acquireReplay']>): ReturnType<Operations2['acquireReplay']>
}
export const RUNNER_HOST = RunnerHostService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    loopExtensionRunner: LoopExtensionRunnerService
    loopExtensionImplementations: LoopExtensionImplementationsService
    runnerHost: RunnerHostService
  }
}
