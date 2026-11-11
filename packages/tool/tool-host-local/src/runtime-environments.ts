import type { Context } from '@deepseek-ai/cordis'
import '@omne-harness/execution-environment-cordis-contract/cordis'
import { ToolEnvironmentService } from '@omne-harness/tool-cordis-contract/cordis'
import {
  createLocalExecutionEnvironment,
  createLocalEnvironmentPlanResolver,
} from './execution-environment.ts'
import type { ToolEnvironmentValue } from './author-environment.ts'
import type { LocalToolRuntimeInput, RuntimeEnvironment } from './runtime-composition.ts'

export function publishRuntimeEnvironment(
  ctx: Context,
  input: LocalToolRuntimeInput,
): RuntimeEnvironment {
  const execution = ctx.executionEnvironment
  const plans = createLocalEnvironmentPlanResolver({
    ...input.environment.plan,
    execution,
    access: input.access.guard,
  })
  const environment = createLocalExecutionEnvironment({
    adoption: input.environment.adoption,
    execution,
    store: input.store,
    plans,
    naming: input.environment.naming,
    cleanup: input.environment.cleanup,
    storage: {
      mode: 'production',
      commitAttempts: input.configuration.ledgerCommitAttempts,
    },
  })
  class Environments extends ToolEnvironmentService<unknown, ToolEnvironmentValue> {
    adoption = environment.adoption
    prepare = environment.prepare
    inspectPreparation = environment.inspectPreparation
    release = environment.release
    inspectRelease = environment.inspectRelease
  }
  new Environments(ctx)
  return environment
}
