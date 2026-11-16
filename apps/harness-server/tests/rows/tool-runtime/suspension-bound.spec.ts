import { describe, expect, it } from 'vitest'
import {
  CHECKPOINT_STATE_MAX_BYTES,
  WAIT_REQUEST_MAX_BYTES,
  WAIT_RESPONSE_MAX_BYTES,
} from '@omne-harness/tool-contract/provider'
import { ConfigError } from '../../../src/config-schema.ts'
import {
  SUSPENSION_COMMAND_BYTES,
  checkSuspensionCommandBound,
} from '../../../src/rows/tool-runtime/suspension-bound.ts'
import type { RowId, TreeRow } from '../../../src/types.ts'

function tree(maxCommandBytes: unknown, plugins = ['storageRow', 'toolRecordsRow']): TreeRow[] {
  return [
    {
      id: 'storage' as RowId,
      plugin: plugins[0]!,
      config: { maxCommandBytes },
      source: 'operator',
    },
    { id: 'tool-records' as RowId, plugin: plugins[1]!, config: {}, source: 'distribution' },
  ]
}

describe('the storage command bound takes the suspension content of a tool call', () => {
  it('needs a command twice the largest of the three records, as they are stored', () => {
    expect(SUSPENSION_COMMAND_BYTES).toBe(
      2 *
        Math.max(
          WAIT_REQUEST_MAX_BYTES * 2,
          Math.ceil(CHECKPOINT_STATE_MAX_BYTES / 3) * 4,
          WAIT_RESPONSE_MAX_BYTES,
        ),
    )
  })

  it('accepts a storage row at the bound and above it', () => {
    expect(() => checkSuspensionCommandBound(tree(SUSPENSION_COMMAND_BYTES))).not.toThrow()
    expect(() => checkSuspensionCommandBound(tree(SUSPENSION_COMMAND_BYTES * 2))).not.toThrow()
  })

  it('refuses a storage row below the bound and names the field and the bound', () => {
    const refused = () => checkSuspensionCommandBound(tree(SUSPENSION_COMMAND_BYTES - 1))
    expect(refused).toThrowError(ConfigError)
    expect(refused).toThrowError(
      new RegExp(
        `storage\\.maxCommandBytes \\(${String(SUSPENSION_COMMAND_BYTES - 1)}\\).*${String(SUSPENSION_COMMAND_BYTES)}`,
        'u',
      ),
    )
  })

  it('checks only a tree that holds both release rows, and leaves a missing value to the storage row', () => {
    expect(() =>
      checkSuspensionCommandBound(tree(1, ['otherStorage', 'toolRecordsRow'])),
    ).not.toThrow()
    expect(() => checkSuspensionCommandBound(tree(1, ['storageRow', 'otherRecords']))).not.toThrow()
    expect(() => checkSuspensionCommandBound(tree(undefined))).not.toThrow()
    expect(() => checkSuspensionCommandBound([])).not.toThrow()
  })
})
