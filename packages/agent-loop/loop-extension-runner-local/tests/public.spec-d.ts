import { expectTypeOf } from 'vitest'
import type {
  LoopExtensionRunnerService,
  RunnerActionRequest,
  RunnerActionResult,
  RunnerDispatchRequest,
  RunnerReplayRequest,
} from '@omne-harness-lite/loop-extension-runner'
import {
  composeEffect,
  inspectRunnerConclusion,
  passKeys,
  prepareRunnerConclusion,
  readRunnerRetryConclusions,
  type RunnerEffect,
  type RunnerKeys,
  type RunnerPorts,
  type RunnerExecution,
} from '@omne-harness-lite/loop-extension-runner'

expectTypeOf(passKeys).toBeFunction()
expectTypeOf(prepareRunnerConclusion).toBeFunction()
expectTypeOf(inspectRunnerConclusion).toBeFunction()
expectTypeOf(readRunnerRetryConclusions).toBeFunction()
expectTypeOf(composeEffect).toBeFunction()
expectTypeOf<RunnerKeys>().toHaveProperty('pass')
expectTypeOf<RunnerEffect>().toHaveProperty('kind')
expectTypeOf<Parameters<RunnerPorts['verifyFailure']>['length']>().toEqualTypeOf<3>()
expectTypeOf<Parameters<RunnerPorts['verifyFailure']>[2]>().toEqualTypeOf<RunnerExecution>()

declare const runner: LoopExtensionRunnerService
declare const batch: RunnerActionRequest
declare const signal: AbortSignal
expectTypeOf(runner.dispatch(batch, signal)).toEqualTypeOf<Promise<RunnerActionResult>>()
expectTypeOf<Extract<RunnerDispatchRequest, { position: 'before_action' }>>().toBeNever()
expectTypeOf<Extract<RunnerReplayRequest, { position: 'before_action' }>>().not.toBeNever()
