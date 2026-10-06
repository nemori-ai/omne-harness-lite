import { instantFromRfc3339 } from '@omne-harness-lite/offer-expiry'
import { MaintenanceFailure } from './failure.ts'

export function metadataTime(value: string): number {
  const parsed = instantFromRfc3339(value)
  if (!('ok' in parsed)) throw new MaintenanceFailure('invalid-backup')
  return parsed.ok
}
