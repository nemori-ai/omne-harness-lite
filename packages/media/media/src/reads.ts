import { fail, succeed } from '@omne-harness/operation-result'
import {
  modalityOf,
  type MediaRow,
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

function fits(opened: Opened, target: VariantTarget): boolean {
  const { facts } = opened
  return (
    target.mediaTypes.includes(opened.mediaType) &&
    opened.bytes.byteLength <= target.maxBytes &&
    (facts.kind !== 'image' ||
      (facts.widthPixels <= target.maxWidth && facts.heightPixels <= target.maxHeight))
  )
}

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

  async function original(row: MediaRow) {
    const bytes = await objects.whole(row)
    if ('failure' in bytes) return bytes
    return succeed<Opened>({
      mediaType: row.mediaType,
      bytes: bytes.ok,
      facts: objects.committed(row).facts,
    })
  }

  async function version(row: MediaRow, opened: Opened, target: VariantTarget) {
    if (fits(opened, target)) return succeed(opened)
    if (modalityOf(row.mediaType) !== 'image') return tooLarge
    const name = `${row.key}\n${JSON.stringify(target)}`
    const known = cache.get(name)
    if (known !== undefined) return succeed(known)
    const fitted = await deps.image.fit(opened.bytes, target)
    if ('failure' in fitted) return tooLarge
    const { mediaType, bytes, widthPixels, heightPixels } = fitted.ok
    const made: Opened = { mediaType, bytes, facts: { kind: 'image', widthPixels, heightPixels } }
    cache.put(name, made)
    return succeed(made)
  }

  /** A page is handed out only from an object whose whole bytes matched its digest once. */
  async function verify(row: MediaRow) {
    if (verified.has(row.key)) return succeed(null)
    const whole = await objects.whole(row)
    if ('failure' in whole) return whole
    if (verified.size >= VERIFIED_KEYS) verified.clear()
    verified.add(row.key)
    return succeed(null)
  }

  return {
    variants: {
      async open(input) {
        const row = await objects.resolve(tenantText(input.tenant), input.ref)
        if ('failure' in row) return row
        const opened = await original(row.ok)
        if ('failure' in opened || input.target === null) return opened
        return version(row.ok, opened.ok, input.target)
      },
    },
    reads: {
      async page(input) {
        const row = await objects.resolve(tenantText(input.tenant), input.ref)
        if ('failure' in row) return row
        const checked = await verify(row.ok)
        if ('failure' in checked) return checked
        const offset = Math.max(0, Math.trunc(input.offset))
        const length = Math.max(0, Math.min(Math.trunc(input.limit), deps.config.partBytes))
        const opened = await objects.storeOf(row.ok.storage)?.open(row.ok.key, { offset, length })
        if (opened === undefined) return materialUnavailable
        if ('failure' in opened)
          return opened.failure.kind === 'not-found' ? materialUnavailable : unavailable('store')
        const part = await collect(opened.ok)
        const end = offset + part.byteLength
        return succeed({ part, next: part.byteLength > 0 && end < row.ok.bytes ? end : null })
      },
    },
  }
}
