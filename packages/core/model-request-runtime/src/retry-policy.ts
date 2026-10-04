import type { JsonNumber } from '@omne-harness-lite/content-blocks'
import type { Duration } from '@omne-harness-lite/tool-definition'


/** S-35: every policy member is explicit; retry permission/counts are separate. */
export interface RetryBackoffPolicy {
  readonly kind: 'constant' | 'linear' | 'exponential'
  readonly base: Duration
  readonly factor: JsonNumber
  readonly max: Duration
  readonly jitter: 'none' | 'full' | 'half' | 'decorrelated'
}
