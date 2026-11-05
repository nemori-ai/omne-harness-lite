// The blocks of the batches the Journal core appended in one write, as the provider stores them
// (R2-D292, R2-D307): the block rows of the values the core put with its facts, and the shape of
// a fact with its event projection. The core names a block by the hex digest of `refOf`, the
// store rows by `sha256:<hex>`: same hash, two spellings, mapped here and nowhere else.
import type { AgentEvent } from '@omne-harness/agent-contract'
import { blobDigest } from '@omne-harness/session-storage-sql/participants'
import type { JsonValue } from '@omne-harness/sql-contract'
import { canonical } from '../testing/canonical.ts'
import type { FactBody } from '../journal/index.ts'

/** One content block a publication writes beside its facts. */
export type CoreBlob = Readonly<{ digest: string; media: string; payload: string }>

/** The blocks one write puts, by row digest. */
export type BlobSink = Map<string, CoreBlob>

export const BLOB_MEDIA = 'application/json'

/** The row digest of a block a fact refers to (`sha256:<hex>` for the fact's `<hex>`). */
export const blobRowDigest = (ref: string): string =>
  ref.startsWith('sha256:') ? ref : `sha256:${ref}`

/** The digest a fact names for the block of row digest `row`: the inverse of `blobRowDigest`. */
export const factDigestOf = (row: string): string =>
  row.startsWith('sha256:') ? row.slice('sha256:'.length) : row

/** A reference to a block: the digest the block row has and the size of its payload. */
export const blobRef = (payload: string): Readonly<{ digest: string; size: number }> => ({
  digest: blobDigest(payload),
  size: Buffer.byteLength(payload, 'utf8'),
})

/** The event projection the store keeps beside an event fact (the row's `event` column). */
export type EventProjection = Readonly<{
  sequence: string
  source: AgentEvent['cause']
  kinds: readonly string[]
  consequences?: JsonValue
  control?: JsonValue
  batch?: JsonValue
}>

/** One derived fact, with its event projection when it is an event. */
export type DerivedFact = Readonly<{ fact: FactBody; event: EventProjection | null }>

/**
 * The block rows of the values the core put with its batches that are not stored yet: the payload
 * is the canonical text `refOf` hashed, so the row digest is the fact's digest with its prefix.
 */
export function coreBlobRows(
  values: ReadonlyMap<string, unknown>,
  stored: (row: string) => boolean,
  into: BlobSink,
): void {
  for (const [digest, value] of values) {
    const row = blobRowDigest(digest)
    if (stored(row) || into.has(row)) continue
    const payload = canonical(value)
    const ref = blobRef(payload)
    if (ref.digest !== row)
      throw new TypeError(`the block ${digest} of the core does not hash to its digest`)
    into.set(row, { digest: row, media: BLOB_MEDIA, payload })
  }
}
