import { expectTypeOf } from 'vitest'
import {
  composeEffect,
  inspectRunnerConclusion,
  passKeys,
  prepareRunnerConclusion,
  readRunnerRetryConclusions,
  type RunnerEffect,
  type RunnerKeys,
} from '../src/index.ts'

expectTypeOf(passKeys).toBeFunction()
expectTypeOf(prepareRunnerConclusion).toBeFunction()
expectTypeOf(inspectRunnerConclusion).toBeFunction()
expectTypeOf(readRunnerRetryConclusions).toBeFunction()
expectTypeOf(composeEffect).toBeFunction()
expectTypeOf<RunnerKeys>().toHaveProperty('pass')
expectTypeOf<RunnerEffect>().toHaveProperty('kind')
