// The batches the Journal core appended in one write, as the provider stores them (R2-D292,
// R2-D307): the facts of the family taken as they are, and the block rows of the values the core
// put with them. K-23 bridge, write side: the core names a block by the hex digest of `refOf`, the
// store rows by `sha256:<hex>`; and the core's `open` still names two values by `blobOf` pairs,
// which are turned into references here. When the core writes references, `referencedBlocks` goes.
import type { AgentEvent } from '@omne-harness/agent-contract'
import type { JsonValue } from '@omne-harness/sql-contract'
import { canonical } from '../testing/canonical.ts'
import type { FactBody, PublishedBatch } from '../journal/index.ts'
import {
  BLOB_MEDIA,
  blobRef,
  blobRowDigest,
  factDigestOf,
  type BlobSink,
} from './journal-core-stub.ts'

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
 * The facts of the batches the Journal core appended in this write (the commands the core already
 * writes as facts, SPEC "事实族与折叠核" "核心的接入"): taken as they are, in order. The core's
 * event facts carry no projection here yet; until the core writes an event-bearing command, the
 * bridge fact of the event carries it (`prepare` in `agent-journal.ts`).
 */
export function coreBatchFacts(appended: readonly PublishedBatch[]): DerivedFact[] {
  return appended.flatMap(batch =>
    batch.facts.map(fact => ({ fact: referencedBlocks(fact) as FactBody, event: null })),
  )
}

const HEX_DIGEST = /^[0-9a-f]{64}$/

/**
 * Transitional (K-23): the core's `open` names the input message and the handoff outcome by
 * `blobOf(value)`, which is the `[digest, value]` pair of a block to put, where the fact wants
 * `refOf(value)`. A pair whose digest is the digest of its value is taken as the reference it
 * stands for, so the fact carries no content; anything else is left as it is. Remove when the core
 * writes references (`src/testing/journal.ts`, the `open` facts).
 */
function referencedBlocks(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) {
    if (
      value.length === 2 &&
      typeof value[0] === 'string' &&
      HEX_DIGEST.test(value[0]) &&
      value[1] !== null &&
      typeof value[1] === 'object'
    ) {
      const payload = canonical(value[1])
      const ref = blobRef(payload)
      if (factDigestOf(ref.digest) === value[0]) return { digest: value[0], size: ref.size }
    }
    return value.map(referencedBlocks)
  }
  const out: Record<string, unknown> = {}
  for (const [key, member] of Object.entries(value)) out[key] = referencedBlocks(member)
  return out
}

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
