import {
  imageBudget,
  open,
  type ImageBudget,
  type ImageFormat,
  type ImageRejectReason,
  type OpenImageHandle,
} from '@omne-harness/image'
import type { ImageCodec, VariantTarget } from '@omne-harness/media-contract'
import { fail, succeed } from '@omne-harness/operation-result'
import { attempts, type Source } from './plan.ts'

/** How large a picture this codec decodes, and how many at once; more wait their turn. */
export type ImageCodecConfig = Readonly<{
  maxWidth: number
  maxHeight: number
  maxDecodedBytes: number
  concurrency: number
}>

type ProbeFailure = 'not-image' | 'unsupported' | 'over-budget'
const REJECTED: Record<ImageRejectReason, ProbeFailure> = {
  empty: 'not-image',
  truncated: 'not-image',
  'not-image': 'not-image',
  decode: 'not-image',
  format: 'unsupported',
  'multi-frame': 'unsupported',
  width: 'over-budget',
  height: 'over-budget',
  'decoded-bytes': 'over-budget',
  concurrent: 'over-budget',
  'in-flight-bytes': 'over-budget',
}

function turns(most: number) {
  let running = 0
  const waiting: (() => void)[] = []
  return async function take<T>(work: () => Promise<T>): Promise<T> {
    if (running < most) running += 1
    else await new Promise<void>(resolve => waiting.push(resolve))
    try {
      return await work()
    } finally {
      const next = waiting.shift()
      if (next === undefined) running -= 1
      else next()
    }
  }
}

function budgetOf(config: ImageCodecConfig): ImageBudget {
  const created = imageBudget({
    formats: ['image/png', 'image/jpeg', 'image/webp'],
    maxWidth: config.maxWidth,
    maxHeight: config.maxHeight,
    maxDecodedBytes: config.maxDecodedBytes,
    maxConcurrentDecodes: config.concurrency,
    maxInFlightBytes: config.maxDecodedBytes * config.concurrency,
  })
  if (created.kind !== 'budget') throw new TypeError(`image codec config: ${created.reason}`)
  return created.budget
}

async function firstThatFits(handle: OpenImageHandle, source: Source, target: VariantTarget) {
  for (const attempt of attempts(source, target)) {
    const encoded = await handle.encode(attempt)
    if (encoded.kind === 'encoded' && encoded.bytes.byteLength <= target.maxBytes)
      return succeed({
        mediaType: encoded.mediaType as string,
        bytes: new Uint8Array(encoded.bytes),
        widthPixels: attempt.width,
        heightPixels: attempt.height,
      })
  }
  return fail({ kind: 'cannot-fit' as const })
}

/** The image port of media over the bounded image member. A config the budget refuses throws here. */
export function createImageCodec(config: ImageCodecConfig): ImageCodec {
  const budget = budgetOf(config)
  const take = turns(config.concurrency)

  async function opened<T>(
    bytes: Uint8Array,
    use: (handle: OpenImageHandle, source: Source) => Promise<T>,
  ) {
    return take(async () => {
      const result = await open({ bytes, budget })
      if (result.kind !== 'opened') return fail({ kind: REJECTED[result.reason] })
      const { declaration, handle, opaque } = result
      try {
        const used = await use(handle, {
          format: declaration.mediaType.slice('image/'.length) as ImageFormat,
          width: declaration.orientedWidth,
          height: declaration.orientedHeight,
          opaque,
        })
        return succeed(used)
      } finally {
        await handle.close()
      }
    })
  }

  return {
    probe: bytes =>
      opened(bytes, async (_, source) => ({
        mediaType: `image/${source.format}`,
        widthPixels: source.width,
        heightPixels: source.height,
      })),
    async fit(bytes, target) {
      const answer = await opened(bytes, (handle, source) => firstThatFits(handle, source, target))
      if ('ok' in answer) return answer.ok
      return fail({ kind: answer.failure.kind === 'not-image' ? 'not-image' : 'cannot-fit' })
    },
  }
}
