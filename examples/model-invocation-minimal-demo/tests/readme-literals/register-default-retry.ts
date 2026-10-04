import {
  createDefaultRetryImplementation,
  DEFAULT_RETRY_BUILTIN,
} from '@omne-harness-lite/model-request-runtime-local'
import type { RunnerImplementations } from '@omne-harness-lite/loop-extension-runner'

export function registerDefaultRetry(registry: RunnerImplementations) {
  const implementation = createDefaultRetryImplementation({
    policy: { kind: 'exponential', base: 'PT1S', factor: 2, max: 'PT30S', jitter: 'full' },
    sample: () => 0.25,
  })
  return registry.registerBuiltin(DEFAULT_RETRY_BUILTIN, implementation)
}
