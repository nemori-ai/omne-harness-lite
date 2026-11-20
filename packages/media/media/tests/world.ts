import { createHash } from 'node:crypto'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  accountCodec,
  organizationCodec,
  tenant as tenantOf,
  tenantCodec,
  type TenantId,
} from '@omne-harness/legal-identity'
import type {
  ByteStore,
  Committed,
  Holder,
  ImageCodec,
  Media,
  MediaIndex,
} from '@omne-harness/media-contract'
import {
  createCrashSwitch,
  createMemoryByteStore,
  createMemoryMediaIndex,
  createMemoryMedium,
} from '@omne-harness/media-contract/testing'
import { createMedia, type MediaConfig } from '@omne-harness/media'

function id<T>(
  codec: { parse(text: string): { ok: true; value: T } | { ok: false } },
  text: string,
): T {
  const parsed = codec.parse(text)
  if (!parsed.ok) throw new Error(`bad identity ${text}`)
  return parsed.value
}
const tenantNamed = (digit: string): TenantId =>
  tenantOf(
    id(organizationCodec, `org_${digit.repeat(26)}`),
    id(accountCodec, `acc_${digit.repeat(26)}`),
  )
export function tenantText(tenant: TenantId): string {
  const text = tenantCodec.encode(tenant)
  if (!text.ok) throw new Error('bad tenant')
  return text.value
}
export const T1 = tenantNamed('1')
export const T2 = tenantNamed('2')

export const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
/** A stand-in image: the PNG signature, then its width, its height and a filler. */
export const png = (width: number, height: number, filler = 0): Uint8Array =>
  new Uint8Array([...PNG, width, height, filler])
export const pdf = (text: string): Uint8Array => new TextEncoder().encode(`%PDF-1.7 ${text}`)
export const digestOf = (bytes: Uint8Array): string =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`
export const holder = (work: string): Holder => ({
  owner: 'session',
  work,
  position: '1',
  purpose: 'input',
})

export const CONFIG: MediaConfig = {
  maxBytes: { image: 64, voice: 64, file: 64 },
  partBytes: 8,
  uploadTtlMs: 60_000,
  stagingTtlMs: 600_000,
  variantCacheBytes: 40,
}

export function ok<T>(reply: { ok: T } | { failure: unknown }): T {
  if ('failure' in reply) throw new Error(`expected ok, got ${JSON.stringify(reply.failure)}`)
  return reply.ok
}
export function failureOf(reply: { ok: unknown } | { failure: { kind: string } }): string {
  if ('ok' in reply) throw new Error(`expected a failure, got ${JSON.stringify(reply.ok)}`)
  return reply.failure.kind
}

/** A stand-in codec: it reads the two bytes after the signature and shrinks by rewriting them. */
export function fakeImage() {
  const fits: string[] = []
  const codec: ImageCodec = {
    async probe(bytes) {
      if (!PNG.every((byte, at) => bytes[at] === byte)) return fail({ kind: 'not-image' })
      const [widthPixels = 0, heightPixels = 0] = bytes.subarray(8, 10)
      if (widthPixels > 200) return fail({ kind: 'over-budget' })
      return succeed({ mediaType: 'image/png', widthPixels, heightPixels })
    },
    async fit(bytes, target) {
      fits.push(`${target.maxWidth}x${target.maxHeight}`)
      if (target.maxBytes < 10) return fail({ kind: 'cannot-fit' })
      const widthPixels = Math.min(bytes[8] ?? 0, target.maxWidth)
      const heightPixels = Math.min(bytes[9] ?? 0, target.maxHeight)
      return succeed({
        mediaType: 'image/webp',
        bytes: new Uint8Array([...PNG, widthPixels, heightPixels]),
        widthPixels,
        heightPixels,
      })
    },
  }
  return { codec, fits }
}

export function world(config: Partial<MediaConfig> = {}) {
  const medium = createMemoryMedium()
  const crash = createCrashSwitch()
  const faults = { remove: false, index: null as 'unavailable' | 'unknown' | null }
  const plainStore = createMemoryByteStore(medium)
  const store: ByteStore = {
    ...plainStore,
    remove: key =>
      faults.remove
        ? Promise.resolve(fail({ kind: 'unavailable', diagnostic: 'remove is off' }))
        : plainStore.remove(key),
  }
  const plainIndex = createMemoryMediaIndex()
  const index = new Proxy(plainIndex, {
    get(target, name, receiver) {
      const value: unknown = Reflect.get(target, name, receiver)
      if (typeof value !== 'function' || faults.index === null) return value
      const kind = faults.index
      return async () => fail({ kind, diagnostic: 'the index is off' })
    },
  }) as MediaIndex
  const clock = {
    at: Date.parse('2026-10-19T00:00:00.000Z'),
    now: () => new Date(clock.at).toISOString(),
  }
  const image = fakeImage()
  let keys = 0
  const open = (): Media =>
    createMedia({
      stores: [crash.wrap(store)],
      writeTo: store.name,
      index: crash.wrap(index),
      image: image.codec,
      clock,
      newKey: () => (keys++).toString(16).padStart(32, '0'),
      config: { ...CONFIG, ...config },
    })
  const w = {
    medium,
    crash,
    faults,
    clock,
    image,
    index: plainIndex,
    store: plainStore,
    media: open(),
    /** A new core over the same store and index: the process after a restart. */
    restart(): Media {
      crash.restart()
      w.media = open()
      return w.media
    },
    advance(ms: number): void {
      clock.at += ms
    },
    async upload(tenant: TenantId, upload: string, bytes: Uint8Array, mediaType = 'image/png') {
      ok(await w.media.uploads.begin({ tenant, upload, mediaType, bytes: bytes.byteLength }))
      let sequence = 0
      for (let at = 0; at < bytes.byteLength; at += CONFIG.partBytes) {
        const part = bytes.subarray(at, at + CONFIG.partBytes)
        ok(await w.media.uploads.append({ tenant, upload, sequence, part }))
        sequence += 1
      }
    },
    async staged(
      tenant: TenantId,
      upload: string,
      bytes: Uint8Array,
      mediaType = 'image/png',
    ): Promise<Committed> {
      await w.upload(tenant, upload, bytes, mediaType)
      return ok(await w.media.uploads.commit({ tenant, upload, digest: digestOf(bytes) }))
    },
    async liveKeys(): Promise<string[]> {
      return [...medium.sealed.keys()].sort()
    },
  }
  return w
}
export type World = ReturnType<typeof world>
