import { formatInstant } from '@omne-harness/ui-kit'
import { encodeInstant, type Instant } from '@omne-harness/utc-instant'

export function formatMoment(at: Instant): string {
  return formatInstant(encodeInstant(at), 'h23')
}
