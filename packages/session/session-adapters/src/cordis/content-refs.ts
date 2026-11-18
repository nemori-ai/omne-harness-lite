import { isTable } from '../journal/shared-map.ts'
import {
  EXEC_FAMILY,
  viewItems,
  type ItemChange,
  type SessionJournalView,
} from '../journal/index.ts'
import { blobRowDigest, factDigestOf } from './journal-batch.ts'

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

export function listedDigests(payload: string): string[] {
  const value = JSON.parse(payload) as unknown
  if (!Array.isArray(value)) return []
  return value.flatMap(item =>
    Array.isArray(item) && typeof item[1] === 'string' && HEX_DIGEST.test(item[1]) ? [item[1]] : [],
  )
}

type CursorLike = Readonly<{
  passages?: Readonly<{ digest?: string }>
  chain?: Readonly<{ digest?: string }> | null
}>

export function cursorReach(
  cursor: unknown,
  payloadOf: (digest: string) => string | undefined,
  into = new Set<string>(),
): Set<string> {
  const inner = (digest: string | undefined): Set<string> => {
    const payload = digest === undefined ? undefined : payloadOf(digest)
    return payload === undefined ? new Set() : refsIn(JSON.parse(payload) as unknown)
  }
  const members = cursor as CursorLike | undefined
  for (const call of inner(members?.passages?.digest)) {
    into.add(call)
    for (const declaration of inner(call)) into.add(declaration)
  }
  for (const declaration of inner(members?.chain?.digest)) into.add(declaration)
  return into
}

// The blocks an item needs in memory: the ones it names, the ones its cursor reaches, and for a finish
// candidate or an obligation list the ones named inside its cursor or list block, which finishing reads.
function itemRefs(
  family: string,
  body: unknown,
  payloadOf: (digest: string) => string | undefined,
): Set<string> {
  const refs = refsIn(body)
  if (family === EXEC_FAMILY) cursorReach((body as { cursor?: unknown }).cursor, payloadOf, refs)
  const inner =
    family === 'candidate'
      ? (body as { cursor?: { digest?: string } }).cursor?.digest
      : family === 'list'
        ? (body as { issued?: { listed?: { digest?: string } } }).issued?.listed?.digest
        : undefined
  const payload = inner === undefined ? undefined : payloadOf(inner)
  if (payload === undefined) return refs
  if (family === 'list') for (const digest of listedDigests(payload)) refs.add(digest)
  else {
    const cursor = JSON.parse(payload) as { members?: unknown }
    refsIn(cursor, refs)
    cursorReach(cursor.members, payloadOf, refs)
  }
  return refs
}

// How many open items name each content block: a block no open item names leaves the caches.
export class ContentRefs {
  readonly #count = new Map<string, number>()

  has(digest: string): boolean {
    return this.#count.has(digest)
  }

  reset(view: SessionJournalView, payloadOf: (digest: string) => string | undefined): void {
    this.#count.clear()
    for (const execution of view.executions.values())
      for (const item of viewItems(execution))
        if (item.open) this.#add(itemRefs(item.family, item.body, payloadOf))
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

// After a publication: counts its item changes and drops from the caches the blocks no open item names.
export function releaseBlocks(
  refs: ContentRefs,
  changes: readonly ItemChange[],
  caches: BlockCaches,
): string[] {
  const released = refs.apply(changes, digest => caches.blobs.get(blobRowDigest(digest)))
  for (const digest of released) {
    caches.blobs.delete(blobRowDigest(digest))
    caches.parsed.delete(digest)
  }
  return released
}

// Before a rebuild: counts the view and keeps in the caches only the blocks its open items name.
export function keepNamed(refs: ContentRefs, view: SessionJournalView, caches: BlockCaches): void {
  refs.reset(view, digest => caches.blobs.get(blobRowDigest(digest)))
  for (const row of caches.blobs.keys()) if (!refs.has(factDigestOf(row))) caches.blobs.delete(row)
  for (const digest of caches.parsed.keys()) if (!refs.has(digest)) caches.parsed.delete(digest)
}
