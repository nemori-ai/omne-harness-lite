import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  modalityOf,
  type MaterialUnavailable,
  type MediaRow,
  type MediaUnavailable,
  type Opened,
  type Reads,
  type VariantTarget,
  type Variants,
} from '@omne-harness/media-contract'
import { collect } from './bytes.ts'
import { tenantText, unavailable, type MediaDependencies } from './deps.ts'
import type { Objects } from './objects.ts'

const tooLarge = fail({ kind: 'too-large' } as const)
const materialUnavailable = fail({ kind: 'material-unavailable' } as const)
const VERIFIED_KEYS = 1024

/** Request versions are not facts: a bounded cache, least recently used first out. */
function createVariantCache(capacity: number) {
  const entries = new Map<string, Opened>()
  let held = 0
  return {
    get(name: string): Opened | undefined {
      const entry = entries.get(name)
      if (entry === undefined) return undefined
      entries.delete(name)
      entries.set(name, entry)
      return entry
    },
    put(name: string, entry: Opened): void {
      if (entry.bytes.byteLength > capacity) return
      held += entry.bytes.byteLength
      entries.set(name, entry)
      for (const [oldest, dropped] of entries) {
        if (held <= capacity) break
        entries.delete(oldest)
        held -= dropped.bytes.byteLength
      }
    },
  }
}

export function createReads(
  deps: MediaDependencies,
  objects: Objects,
): { variants: Variants; reads: Reads } {
  const cache = createVariantCache(deps.config.variantCacheBytes)
  const verified = new Set<string>()

  /** The original answers a target it is already within: its row says so, no byte is read. */
  function within(row: MediaRow, target: VariantTarget): boolean {
    const { facts } = objects.committed(row)
    return (
      target.mediaTypes.includes(row.mediaType) &&
      row.bytes <= target.maxBytes &&
      (facts.kind !== 'image' ||
        (facts.widthPixels <= target.maxWidth && facts.heightPixels <= target.maxHeight))
    )
  }

  async function original(row: MediaRow) {
    const bytes = await objects.whole(row)
    if ('failure' in bytes) return bytes
    return succeed<Opened>({
      mediaType: row.mediaType,
      bytes: bytes.ok,
      facts: objects.committed(row).facts,
    })
  }

  /** The version of an original that is not within the target: from the cache, or made and kept. */
  async function version(row: MediaRow, target: VariantTarget) {
    if (modalityOf(row.mediaType) !== 'image') return tooLarge
    const name = `${row.key}\n${JSON.stringify(target)}`
    const known = cache.get(name)
    if (known !== undefined) return succeed(known)
    const whole = await objects.whole(row)
    if ('failure' in whole) return whole
    const fitted = await deps.image.fit(whole.ok, target)
    if ('failure' in fitted) return tooLarge
    const { mediaType, bytes, widthPixels, heightPixels } = fitted.ok
    const made: Opened = { mediaType, bytes, facts: { kind: 'image', widthPixels, heightPixels } }
    cache.put(name, made)
    return succeed(made)
  }

  /** A range of the original, handed out only from an object whose whole bytes matched its digest once. */
  async function range(
    row: MediaRow,
    offset: number,
    length: number,
  ): Promise<Outcome<Uint8Array, MaterialUnavailable | MediaUnavailable>> {
    if (!verified.has(row.key)) {
      const whole = await objects.whole(row)
      if ('failure' in whole) return whole
      if (verified.size >= VERIFIED_KEYS) verified.clear()
      verified.add(row.key)
    }
    const opened = await objects.storeOf(row.storage)?.open(row.key, { offset, length })
    if (opened === undefined) return unavailable('store')
    if ('failure' in opened)
      return opened.failure.kind === 'not-found' ? materialUnavailable : unavailable('store')
    return succeed(await collect(opened.ok))
  }

  return {
    variants: {
      async open(input) {
        const row = await objects.resolve(tenantText(input.tenant), input.ref)
        if ('failure' in row) return row
        return input.target === null || within(row.ok, input.target)
          ? original(row.ok)
          : version(row.ok, input.target)
      },
    },
    reads: {
      async page(input) {
        const row = await objects.resolve(tenantText(input.tenant), input.ref)
        if ('failure' in row) return row
        const offset = Math.max(0, Math.trunc(input.offset))
        const length = Math.max(0, Math.min(Math.trunc(input.limit), deps.config.partBytes))
        const next = (part: Uint8Array, bytes: number) =>
          part.byteLength > 0 && offset + part.byteLength < bytes ? offset + part.byteLength : null
        if (input.target === null || within(row.ok, input.target)) {
          const part = await range(row.ok, offset, length)
          if ('failure' in part) return part
          const { mediaType, bytes } = row.ok
          const { facts } = objects.committed(row.ok)
          return succeed({ part: part.ok, next: next(part.ok, bytes), mediaType, bytes, facts })
        }
        const made = await version(row.ok, input.target)
        if ('failure' in made) return made
        const { mediaType, facts } = made.ok
        const bytes = made.ok.bytes.byteLength
        const part = made.ok.bytes.subarray(offset, offset + length)
        return succeed({ part, next: next(part, bytes), mediaType, bytes, facts })
      },
    },
  }
}
