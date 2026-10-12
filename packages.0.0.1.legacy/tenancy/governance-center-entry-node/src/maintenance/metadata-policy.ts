import { instantFromRfc3339, type ClockCheckpoint } from '@omne-harness-lite/offer-expiry'
import { MaintenanceFailure } from './failure.ts'

export function metadataTime(value: string): number {
  const parsed = instantFromRfc3339(value)
  if (!('ok' in parsed)) throw new MaintenanceFailure('invalid-backup')
  return parsed.ok
}

/** The digest covers database bytes followed by this canonical checkpoint suffix. */
export function checkpointDigestBytes(value: ClockCheckpoint): Uint8Array {
  return new TextEncoder().encode(
    `\nOMNE-CLOCK-CHECKPOINT/1\n${value.writtenAt}\n${value.upperBound}\n`,
  )
}
