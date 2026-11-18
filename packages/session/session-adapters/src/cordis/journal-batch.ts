import type { AgentEvent } from '@omne-harness/agent-contract'
import { blobDigest } from '@omne-harness/session-storage-sql/participants'
import type { JsonValue } from '@omne-harness/sql-contract'
import { canonical } from '../testing/canonical.ts'
import type { FactBody } from '../journal/index.ts'

export type CoreBlob = Readonly<{ digest: string; media: string; payload: string }>

export type BlobSink = Map<string, CoreBlob>

export const BLOB_MEDIA = 'application/json'

export const blobRowDigest = (ref: string): string =>
  ref.startsWith('sha256:') ? ref : `sha256:${ref}`

export const factDigestOf = (row: string): string =>
  row.startsWith('sha256:') ? row.slice('sha256:'.length) : row

export const blobRef = (payload: string): Readonly<{ digest: string; size: number }> => ({
  digest: blobDigest(payload),
  size: Buffer.byteLength(payload, 'utf8'),
})

export type EventProjection = Readonly<{
  sequence: string
  source: AgentEvent['cause']
  kinds: readonly string[]
  consequences?: JsonValue
  control?: JsonValue
  batch?: JsonValue
}>

export type DerivedFact = Readonly<{ fact: FactBody; event: EventProjection | null }>

// Only the blocks this write added can be missing from storage: an earlier write either stored its blocks or had its copy rebuilt.
export function coreBlobRows(
  values: ReadonlyMap<string, unknown>,
  added: Iterable<string>,
  stored: (row: string) => boolean,
  into: BlobSink,
): void {
  for (const digest of added) {
    if (!values.has(digest)) continue
    const value = values.get(digest)
    const row = blobRowDigest(digest)
    if (stored(row) || into.has(row)) continue
    const payload = canonical(value)
    const ref = blobRef(payload)
    if (ref.digest !== row)
      throw new TypeError(`the block ${digest} of the core does not hash to its digest`)
    into.set(row, { digest: row, media: BLOB_MEDIA, payload })
  }
}
