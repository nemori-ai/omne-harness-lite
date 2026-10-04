import { expectTypeOf } from 'vitest'
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
} from '../src/index.ts'

expectTypeOf(passKeys).toBeFunction()
expectTypeOf(prepareRunnerConclusion).toBeFunction()
expectTypeOf(inspectRunnerConclusion).toBeFunction()
expectTypeOf(readRunnerRetryConclusions).toBeFunction()
expectTypeOf(composeEffect).toBeFunction()
expectTypeOf<RunnerKeys>().toHaveProperty('pass')
expectTypeOf<RunnerEffect>().toHaveProperty('kind')
expectTypeOf<Parameters<RunnerPorts['verifyFailure']>['length']>().toEqualTypeOf<3>()
expectTypeOf<Parameters<RunnerPorts['verifyFailure']>[2]>().toEqualTypeOf<RunnerExecution>()
