import { type RetryBackoffPolicy } from '@omne-harness-lite/model-request-runtime'
import type { JsonNumber } from '@omne-harness-lite/content-blocks'
import type { Duration } from '@omne-harness-lite/tool-definition'

interface RetryDelayFacts {
  readonly n: JsonNumber
  readonly uniformSample: JsonNumber
}

export type RetryDelayInput = RetryDelayFacts &
  (
    | {
        readonly policy: RetryBackoffPolicy & {
          readonly jitter: 'none' | 'full' | 'half'
        }
        readonly previousDelay?: never
      }
    | {
        readonly policy: RetryBackoffPolicy & { readonly jitter: 'decorrelated' }
        readonly previousDelay: Duration
      }
  )

export type RetryDelayResult =
  { readonly ok: Duration } | { readonly invalidInput: { readonly reason: 'malformed' } }
