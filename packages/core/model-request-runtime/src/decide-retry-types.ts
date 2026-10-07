import type { JsonNumber } from '@omne-harness-lite/content-blocks'
import type {
  AfterModelCallFailureSubject,
  ObservedOutput,
  RetryOutput,
} from '@omne-harness-lite/loop-extension'
import type { Duration } from '@omne-harness-lite/tool-definition'
import type { RetryBackoffPolicy } from './retry-delay-types.ts'

/** S-60/S-76: the caller supplies the complete LC6 failure subject or explicit unavailability. */
export type RetryFailureFact =
  { readonly known: AfterModelCallFailureSubject } | { readonly unknown: true }

export type DecideRetryInput = { readonly subject: RetryFailureFact } & (
  | {
      readonly policy: RetryBackoffPolicy & { readonly jitter: 'none' | 'full' | 'half' }
      readonly uniformSample: JsonNumber
      readonly previousDelay?: never
    }
  | {
      readonly policy: RetryBackoffPolicy & { readonly jitter: 'decorrelated' }
      readonly uniformSample: JsonNumber
      readonly previousDelay: Duration
    }
)

export type DecideRetryResult =
  RetryOutput | ObservedOutput | { readonly rejected: 'invalidInput' | 'unavailable' }
