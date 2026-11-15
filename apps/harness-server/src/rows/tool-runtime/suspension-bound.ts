import {
  CHECKPOINT_STATE_MAX_BYTES,
  WAIT_REQUEST_MAX_BYTES,
  WAIT_RESPONSE_MAX_BYTES,
} from '@omne-harness/tool-contract/provider'
import { ConfigError } from '../../config-schema.ts'
import type { TreeRow } from '../../types.ts'

export const SUSPENSION_COMMAND_BYTES =
  2 *
  Math.max(
    WAIT_REQUEST_MAX_BYTES * 2,
    Math.ceil(CHECKPOINT_STATE_MAX_BYTES / 3) * 4,
    WAIT_RESPONSE_MAX_BYTES,
  )

export function checkSuspensionCommandBound(rows: readonly TreeRow[]): void {
  const storage = rows.find(row => row.id === 'storage' && row.plugin === 'storageRow')
  const records = rows.find(row => row.id === 'tool-records' && row.plugin === 'toolRecordsRow')
  if (storage === undefined || records === undefined) return
  const bound: unknown =
    typeof storage.config === 'object' && storage.config !== null
      ? Reflect.get(storage.config, 'maxCommandBytes')
      : undefined
  if (typeof bound !== 'number' || bound >= SUSPENSION_COMMAND_BYTES) return
  throw new ConfigError(
    'invalid-config',
    `storage.maxCommandBytes (${String(bound)}) must be at least ${String(SUSPENSION_COMMAND_BYTES)}: ` +
      'a smaller command cannot hold the request, the state or the response of a suspended tool call',
  )
}
