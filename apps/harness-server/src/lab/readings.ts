import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { StorageReadings } from '@omne-harness/sql-contract'
import { storageHostKey } from '@omne-harness/sql-contract/cordis'
import type { StorageHostAdapter } from '../entry/storage-host.ts'
import { serveVisibility } from '../profile.ts'
import { defineRow } from '../row.ts'
import type { RowId, ServiceName, Visibility } from '../types.ts'

export const LAB_READINGS_ROW = { id: 'lab-readings', plugin: 'labReadings', config: {} } as const

/** What the rows of the release see, and the storage host for the row that reads its counts. */
export const labVisibility: Visibility = new Map([
  ...serveVisibility,
  [LAB_READINGS_ROW.id as RowId, [storageHostKey as ServiceName]],
])

/** What the storage of this run counted so far; null while the tree has no storage host. */
export type ReadingsSource = { read: (() => StorageReadings) | null }

/** Only in the lab assembly: hands the readings of the storage to whoever drives the run. */
export const labReadingsRow = (source: ReadingsSource) =>
  defineRow({
    row: LAB_READINGS_ROW.id,
    implementation: 'contract-double',
    manifest: { provides: [], injects: [storageHostKey], sameProviderGroup: null },
    lifecycle: { kind: 'none' },
    plugin: {
      inject: [storageHostKey],
      apply(ctx: Context) {
        const host = ctx.get(storageHostKey) as StorageHostAdapter
        ctx.effect(() => {
          source.read = () => host.readings()
          return () => {
            source.read = null
          }
        })
      },
    },
  })

export type StepLine = Readonly<{
  kind: 'lab-step'
  request: number
  path: string
  requestBytes: number
  requestDigest: string
  storage: StorageReadings | null
}>

/** The line a model request leaves as it arrives: which request, what it carried, what the storage had counted. */
export function stepLine(
  request: Readonly<{ index: number; rawBody: string; path: string }>,
  source: ReadingsSource,
): StepLine {
  return {
    kind: 'lab-step',
    request: request.index + 1,
    path: request.path,
    requestBytes: Buffer.byteLength(request.rawBody),
    requestDigest: `sha256:${createHash('sha256').update(request.rawBody).digest('hex')}`,
    storage: source.read?.() ?? null,
  }
}

export type StorageLine =
  | Readonly<{ kind: 'lab-storage'; ok: true; storage: StorageReadings }>
  | Readonly<{ kind: 'lab-storage'; ok: false; error: string }>

export const storageLine = (source: ReadingsSource): StorageLine =>
  source.read === null
    ? { kind: 'lab-storage', ok: false, error: 'the storage is not up' }
    : { kind: 'lab-storage', ok: true, storage: source.read() }
