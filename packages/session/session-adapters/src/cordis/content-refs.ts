import { isTable } from '../journal/shared-map.ts'
import {
  releasedMaterials,
  viewItems,
  type ExecutionView,
  type ItemChange,
  type SessionJournalView,
} from '../journal/index.ts'
import { blobRef, blobRowDigest, factDigestOf, type CoreBlob } from './journal-batch.ts'
import type { Prepared } from './journal-publication.ts'

const HEX_DIGEST = /^[0-9a-f]{64}$/

export function refsIn(value: unknown, into = new Set<string>()): Set<string> {
  if (value === null || typeof value !== 'object') return into
  const members = isTable(value) ? value.values() : Array.isArray(value) ? value : null
  if (members !== null) {
    for (const member of members) refsIn(member, into)
    return into
  }
  const record = value as Record<string, unknown>
  if (
    typeof record['digest'] === 'string' &&
    HEX_DIGEST.test(record['digest']) &&
    typeof record['size'] === 'number'
  )
    into.add(record['digest'])
  for (const member of Object.values(record)) refsIn(member, into)
  return into
}

export function recordRefs(view: ExecutionView, into = new Set<string>()): Set<string> {
  const released = releasedMaterials(view)
  if (released.size === 0) return refsIn(view, into)
  const kept = [...view.materials].filter(([key]) => !released.has(key)).map(([, item]) => item)
  return refsIn({ ...view, materials: kept }, into)
}

export function listedDigests(payload: string): string[] {
  const value = JSON.parse(payload) as unknown
  if (!Array.isArray(value)) return []
  return value.flatMap(item =>
    Array.isArray(item) && typeof item[1] === 'string' && HEX_DIGEST.test(item[1]) ? [item[1]] : [],
  )
}

// The blocks an item needs in memory: the ones it names, and for a finish candidate or an obligation
// list the ones named inside its cursor or list block, which finishing reads.
function itemRefs(
  family: string,
  body: unknown,
  payloadOf: (digest: string) => string | undefined,
): Set<string> {
  const refs = refsIn(body)
  const inner =
    family === 'candidate'
      ? (body as { cursor?: { digest?: string } }).cursor?.digest
      : family === 'list'
        ? (body as { issued?: { listed?: { digest?: string } } }).issued?.listed?.digest
        : undefined
  const payload = inner === undefined ? undefined : payloadOf(inner)
  if (payload === undefined) return refs
  if (family === 'list') for (const digest of listedDigests(payload)) refs.add(digest)
  else refsIn(JSON.parse(payload) as unknown, refs)
  return refs
}

// How many open items name each content block: a block no open item names leaves the caches.
export class ContentRefs {
  readonly #count = new Map<string, number>()
  readonly #owned = new Set<string>()
  readonly #stored = new Map<string, Set<string>>()

  has(digest: string): boolean {
    return this.#count.has(digest)
  }

  held(caches: BlockCaches, row: string, execution: string): 'shared' | 'owned' | null {
    if (this.#stored.get(execution)?.has(row) === true) return 'shared'
    return caches.blobs.has(row) && this.#owned.has(row) ? 'owned' : null
  }

  keep(
    caches: BlockCaches,
    blobs: readonly CoreBlob[],
    contents: Iterable<string>,
    execution: string | null = null,
  ): void {
    const stored = execution === null ? null : this.#storedOf(execution)
    for (const blob of blobs) {
      caches.blobs.set(blob.digest, blob.payload)
      this.#owned.delete(blob.digest)
      stored?.add(blob.digest)
    }
    for (const payload of contents) {
      const row = blobRef(payload).digest
      if (caches.blobs.has(row)) continue
      caches.blobs.set(row, payload)
      this.#owned.add(row)
    }
  }

  forget(caches: BlockCaches, row: string): void {
    caches.blobs.delete(row)
    this.#owned.delete(row)
  }

  settled(execution: string): void {
    this.#stored.delete(execution)
  }

  #storedOf(execution: string): Set<string> {
    let stored = this.#stored.get(execution)
    if (stored === undefined) {
      stored = new Set()
      this.#stored.set(execution, stored)
    }
    return stored
  }

  reset(view: SessionJournalView, payloadOf: (digest: string) => string | undefined): void {
    this.#count.clear()
    for (const execution of view.executions.values()) {
      const released = releasedMaterials(execution)
      for (const item of viewItems(execution))
        if (item.open && !(item.family === 'material' && released.has(item.item)))
          this.#add(itemRefs(item.family, item.body, payloadOf))
    }
  }

  // Applies one publication; answers the blocks no open item names anymore.
  apply(
    changes: readonly ItemChange[],
    payloadOf: (digest: string) => string | undefined,
  ): string[] {
    const released: string[] = []
    for (const change of changes) {
      if (change.open) this.#add(itemRefs(change.family, change.body, payloadOf))
      if (change.before === undefined) continue
      for (const digest of itemRefs(change.family, change.before, payloadOf)) {
        const count = (this.#count.get(digest) ?? 0) - 1
        if (count > 0) this.#count.set(digest, count)
        else {
          this.#count.delete(digest)
          released.push(digest)
        }
      }
    }
    return released.filter(digest => !this.#count.has(digest))
  }

  #add(refs: Iterable<string>): void {
    for (const digest of refs) this.#count.set(digest, (this.#count.get(digest) ?? 0) + 1)
  }
}

export type BlockCaches = Readonly<{ blobs: Map<string, string>; parsed: Map<string, unknown> }>

// After a publication: caches its blocks and drops from the caches the blocks no open item names.
export function settleBlocks(
  refs: ContentRefs,
  prepared: Pick<Prepared, 'blobs' | 'changes' | 'itemRows'>,
  caches: BlockCaches,
  execution: string,
): string[] {
  refs.keep(
    caches,
    prepared.blobs,
    prepared.itemRows.contents.map(item => item.payload),
    execution,
  )
  const released = refs.apply(prepared.changes, digest => caches.blobs.get(blobRowDigest(digest)))
  for (const digest of released) {
    refs.forget(caches, blobRowDigest(digest))
    caches.parsed.delete(digest)
  }
  return released
}

// Before a rebuild: counts the view and keeps in the caches only the blocks its open items name.
export function keepNamed(refs: ContentRefs, view: SessionJournalView, caches: BlockCaches): void {
  refs.reset(view, digest => caches.blobs.get(blobRowDigest(digest)))
  for (const row of caches.blobs.keys()) if (!refs.has(factDigestOf(row))) refs.forget(caches, row)
  for (const digest of caches.parsed.keys()) if (!refs.has(digest)) caches.parsed.delete(digest)
}
