// The storage command bound against the suspension content of a tool call (Tool SPEC 30 and 31).
// Tool keeps three things of a suspended call in records of the call domain, each written by one
// commit: the request original of the wait, the checkpoint state and the response. The Tool
// contract bounds the three. The command bound of the storage row is an operator value, so the
// relation between the two is checked here, at the configuration boundary. With it the store never
// refuses one of those commits for its size, and a suspended call cannot be left without an
// outcome for that reason; the ledger therefore has no terminal for a refused suspension.
import {
  CHECKPOINT_STATE_MAX_BYTES,
  WAIT_REQUEST_MAX_BYTES,
  WAIT_RESPONSE_MAX_BYTES,
} from '@omne-harness/tool-contract/provider'
import { ConfigError } from '../../config-schema.ts'
import type { TreeRow } from '../../types.ts'

/**
 * The command bytes those commits need: twice the largest of the three records as it is stored.
 * The request original is canonical JSON text and takes at most twice its size as a string of the
 * record; the state is base64 text; the other half of the command is for the other records.
 */
export const SUSPENSION_COMMAND_BYTES =
  2 *
  Math.max(
    WAIT_REQUEST_MAX_BYTES * 2,
    Math.ceil(CHECKPOINT_STATE_MAX_BYTES / 3) * 4,
    WAIT_RESPONSE_MAX_BYTES,
  )

/**
 * Refuses a storage row whose command bound is below SUSPENSION_COMMAND_BYTES. Checked only when
 * the storage row and the Tool records row are the release exports. A storage row without a
 * numeric bound is the storage row's own fault to report.
 */
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
