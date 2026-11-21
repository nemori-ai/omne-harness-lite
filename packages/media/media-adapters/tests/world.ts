import { createHash } from 'node:crypto'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  accountCodec,
  organizationCodec,
  tenant as tenantOf,
  tenantCodec,
  type TenantId,
} from '@omne-harness/legal-identity'
import { createEngineRegistry, createMedia } from '@omne-harness/media'
import type {
  ContentReference,
  ConverterDefinitions,
  EngineInput,
  EngineOutput,
  ImageCodec,
} from '@omne-harness/media-contract'
import {
  createMemoryByteStore,
  createMemoryMediaIndex,
  createScriptedEngine,
} from '@omne-harness/media-contract/testing'

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
export const T1 = tenantNamed('1')
export const T2 = tenantNamed('2')

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
/** A stand-in image: the PNG signature, then its width, its height and a filler. */
export const png = (width: number, height: number, filler = 0): Uint8Array =>
  new Uint8Array([...PNG, width, height, filler])
const probe: ImageCodec['probe'] = async bytes => {
  const [widthPixels = 0, heightPixels = 0] = bytes.subarray(8, 10)
  return succeed({ mediaType: 'image/png', widthPixels, heightPixels })
}
/** A stand-in for fitting: the stand-in image within the target, when a PNG of its size is allowed. */
export const shrinking: ImageCodec['fit'] = async (bytes, target) => {
  const [width = 0, height = 0] = bytes.subarray(8, 10)
  const [widthPixels, heightPixels] = [
    Math.min(width, target.maxWidth),
    Math.min(height, target.maxHeight),
  ]
  const made = png(widthPixels, heightPixels)
  if (made.byteLength > target.maxBytes || !target.mediaTypes.includes('image/png'))
    return fail({ kind: 'cannot-fit' })
  return succeed({ mediaType: 'image/png', bytes: made, widthPixels, heightPixels })
}

export function ok<T>(reply: { ok: T } | { failure: unknown }): T {
  if ('failure' in reply) throw new Error(`expected ok, got ${JSON.stringify(reply.failure)}`)
  return reply.ok
}

/** A WAV of a few samples; `seed` makes each one another medium. */
export function wav(seed = 1): Uint8Array {
  const bytes = new Uint8Array(44 + 8)
  const view = new DataView(bytes.buffer)
  const tag = (at: number, text: string) => bytes.set(new TextEncoder().encode(text), at)
  tag(0, 'RIFF')
  view.setUint32(4, 36 + 8, true)
  tag(8, 'WAVE')
  tag(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, 8000, true)
  view.setUint32(28, 8000, true)
  view.setUint16(32, 1, true)
  view.setUint16(34, 8, true)
  tag(36, 'data')
  view.setUint32(40, 8, true)
  view.setUint16(44, seed)
  return bytes
}

export const VOICE = { name: 'voice', revision: '1' }
export const ENGINE = { name: 'voice.fixture', revision: '1' }

/** Speech has a definition in force whose engine answers as the test says; nothing else has one. */
function conversion(answer: ((input: EngineInput) => Promise<EngineOutput>) | undefined) {
  const engines = createEngineRegistry()
  if (answer !== undefined)
    engines.contribute(
      createScriptedEngine(answer, { name: ENGINE.name, accepts: ['audio/*'] }).engine,
    )
  const definitions: ConverterDefinitions = {
    resolve: async ({ mediaType }) =>
      succeed(
        answer !== undefined && mediaType.startsWith('audio/')
          ? {
              kind: 'resolved',
              definition: VOICE,
              engine: ENGINE.name,
              parameters: {},
              egress: { kind: 'in-process' },
            }
          : { kind: 'none' },
      ),
  }
  return { engines, definitions }
}

/** The custody of media over ports in memory, and what a test needs to bring media into it. */
export function world(
  fit: ImageCodec['fit'] = async () => fail({ kind: 'cannot-fit' }),
  answer?: (input: EngineInput) => Promise<EngineOutput>,
) {
  const index = createMemoryMediaIndex()
  const { engines, definitions } = conversion(answer)
  let keys = 0
  const media = createMedia({
    stores: [createMemoryByteStore()],
    writeTo: 'memory',
    index,
    image: { probe, fit },
    clock: { now: () => '2026-10-19T00:00:00.000Z' },
    timer: { after: () => () => undefined },
    definitions: () => definitions,
    engines: () => engines,
    newKey: () => (keys++).toString(16).padStart(32, '0'),
    config: {
      maxBytes: { image: 64, voice: 64, file: 64 },
      partBytes: 64,
      uploadTtlMs: 60_000,
      stagingTtlMs: 600_000,
      variantCacheBytes: 40,
      conversion: { timeoutMs: 5_000, queueLimit: 1, inlineTextBytes: 16 },
    },
  })
  const begin = async (
    tenant: TenantId,
    upload: string,
    bytes: Uint8Array,
    mediaType = 'image/png',
  ) => {
    ok(await media.uploads.begin({ tenant, upload, mediaType, bytes: bytes.byteLength }))
    ok(await media.uploads.append({ tenant, upload, sequence: 0, part: bytes }))
  }
  return {
    media,
    begin,
    async staged(
      tenant: TenantId,
      upload: string,
      bytes: Uint8Array,
      mediaType = 'image/png',
    ): Promise<ContentReference> {
      await begin(tenant, upload, bytes, mediaType)
      const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`
      return ok(await media.uploads.commit({ tenant, upload, digest })).ref
    },
    async holders(tenant: TenantId, ref: ContentReference): Promise<number> {
      const text = tenantCodec.encode(tenant)
      if (!text.ok) throw new Error('bad tenant')
      return ok(await index.readLive(ref.key, text.value)).holderCount
    },
  }
}
