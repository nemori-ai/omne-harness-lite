import type { Context } from '@deepseek-ai/cordis'
import { ModelRetrySampleService, MODEL_RETRY_SAMPLE } from '@omne-harness-lite/model-request-runtime/cordis'
import type { DefaultRetryConfiguration } from '../src/default-retry.ts'
import { modelDefaultRetry } from '../src/cordis.ts'

/** Live sample port belongs to the fixture root, while the real plugin owns its contribution. */
export function loadDefaultRetry(ctx: Context, input: DefaultRetryConfiguration) {
  const scope = ctx.isolate(MODEL_RETRY_SAMPLE)
  const sample = input.sample
  class Sample extends ModelRetrySampleService { sample() { return sample() } }
  new Sample(scope)
  return scope.plugin(modelDefaultRetry, { policy: input.policy })
}

import { LoopExtensionImplementationsService } from '@omne-harness-lite/loop-extension-runner/cordis'
import type { RunnerImplementations } from '@omne-harness-lite/loop-extension-runner'
/** The fixture implements the same caller-effect ownership as the real registry service. */
export class EffectImplementations extends LoopExtensionImplementationsService {
  constructor(ctx: Context, private readonly operations: RunnerImplementations) { super(ctx) }
  registerBuiltin(...args: Parameters<RunnerImplementations['registerBuiltin']>) {
    const dispose = this.ctx.effect(() => this.operations.registerBuiltin(...args))
    return () => { void dispose() }
  }
}
