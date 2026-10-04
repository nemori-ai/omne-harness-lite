import type { RetryBackoffPolicy } from '@omne-harness-lite/model-request-runtime'

export function policyKind(value: unknown): value is RetryBackoffPolicy['kind'] {
  return value === 'constant' || value === 'linear' || value === 'exponential'
}

export function policyJitter(value: unknown): value is RetryBackoffPolicy['jitter'] {
  return value === 'none' || value === 'full' || value === 'half' || value === 'decorrelated'
}
