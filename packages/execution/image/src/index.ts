import { decodeRaster, encodeRaster } from './adapter.ts'
import { readContainer } from './container.ts'

declare const imageBudgetBrand: unique symbol

export const IMAGE_FORMATS = ['png', 'jpeg', 'webp'] as const

export type ImageFormat = (typeof IMAGE_FORMATS)[number]

export type ImageMediaType = `image/${ImageFormat}`

export interface BudgetInput {
  readonly formats: readonly ImageMediaType[]
  readonly maxWidth: number
  readonly maxHeight: number
  readonly maxDecodedBytes: number
  readonly maxConcurrentDecodes: number
  readonly maxInFlightBytes: number
}

export type BudgetRejectReason =
  | 'formats'
  | 'max-width'
  | 'max-height'
  | 'max-decoded-bytes'
  | 'max-concurrent'
  | 'max-in-flight-bytes'

export interface ImageBudget {
  readonly [imageBudgetBrand]: true
  heldReservation(): { readonly count: number; readonly bytes: number }
}

export type BudgetResult =
  | { readonly kind: 'budget'; readonly budget: ImageBudget }
  | { readonly kind: 'rejected'; readonly reason: BudgetRejectReason }

export type ImageRejectReason =
  | 'empty'
  | 'truncated'
  | 'not-image'
  | 'format'
  | 'multi-frame'
  | 'width'
  | 'height'
  | 'decoded-bytes'
  | 'concurrent'
  | 'in-flight-bytes'
  | 'decode'

export interface ImageDeclaration {
  readonly mediaType: ImageMediaType
  readonly orientedWidth: number
  readonly orientedHeight: number
  readonly trusted: false
}

export interface OpenImageHandle {
  readonly phase: 'open'
  encode(request: { readonly format: ImageFormat }): Promise<EncodeResult>
  close(): Promise<CloseResult>
}

export interface ClosedImageHandle {
  readonly phase: 'closed'
  readonly reservation: 'released'
  readonly nativeStop: 'not-proven'
  close(): Promise<ClosedImageHandle>
}

export type CloseResult =
  | { readonly kind: 'closed'; readonly handle: ClosedImageHandle }
  | { readonly kind: 'still-open'; readonly handle: OpenImageHandle }

export type EncodeResult =
  | {
      readonly kind: 'encoded'
      readonly mediaType: ImageMediaType
      readonly bytes: Uint8Array
      readonly orientation: 'absent'
      readonly exif: 'absent'
    }
  | { readonly kind: 'rejected'; readonly reason: 'closed' | 'encode' }

export type OpenResult =
  | { readonly kind: 'rejected'; readonly reason: ImageRejectReason }
  | {
      readonly kind: 'opened'
      readonly handle: OpenImageHandle
      readonly declaration: ImageDeclaration
      readonly verifiedBytes: Uint8Array
    }

const mediaTypeByFormat = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
} as const satisfies Record<ImageFormat, ImageMediaType>

type Pool = {
  readonly formats: readonly ImageMediaType[]
  readonly maxWidth: number
  readonly maxHeight: number
  readonly maxDecodedBytes: number
  readonly maxConcurrentDecodes: number
  readonly maxInFlightBytes: number
  count: number
  bytes: number
}

const pools = new WeakMap<ImageBudget, Pool>()

function positive(value: number): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function formatsOf(input: readonly ImageMediaType[]): BudgetRejectReason | readonly ImageMediaType[] {
  if (input.length === 0) return 'formats'
  const seen = new Set<ImageMediaType>()
  for (const format of input) {
    if (!IMAGE_FORMATS.some(name => mediaTypeByFormat[name] === format) || seen.has(format)) return 'formats'
    seen.add(format)
  }
  return input
}

export function imageBudget(input: BudgetInput): BudgetResult {
  const formats = formatsOf(input.formats)
  if (typeof formats === 'string') return { kind: 'rejected', reason: formats }
  if (!positive(input.maxWidth)) return { kind: 'rejected', reason: 'max-width' }
  if (!positive(input.maxHeight)) return { kind: 'rejected', reason: 'max-height' }
  if (!positive(input.maxDecodedBytes)) return { kind: 'rejected', reason: 'max-decoded-bytes' }
  if (!positive(input.maxConcurrentDecodes)) return { kind: 'rejected', reason: 'max-concurrent' }
  if (!positive(input.maxInFlightBytes)) return { kind: 'rejected', reason: 'max-in-flight-bytes' }
  const pool: Pool = {
    formats,
    maxWidth: input.maxWidth,
    maxHeight: input.maxHeight,
    maxDecodedBytes: input.maxDecodedBytes,
    maxConcurrentDecodes: input.maxConcurrentDecodes,
    maxInFlightBytes: input.maxInFlightBytes,
    count: 0,
    bytes: 0,
  }
  const budget = {
    heldReservation() {
      return { count: pool.count, bytes: pool.bytes }
    },
  } as ImageBudget
  pools.set(budget, pool)
  return { kind: 'budget', budget }
}

function orientedSize(width: number, height: number, orientation: number): { width: number; height: number } {
  if (orientation >= 5 && orientation <= 8) return { width: height, height: width }
  return { width, height }
}

function decodedBytes(width: number, height: number): number | undefined {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)) return undefined
  const pixels = width * height
  if (!Number.isSafeInteger(pixels)) return undefined
  const bytes = pixels * 4
  return Number.isSafeInteger(bytes) ? bytes : undefined
}

function reject(reason: ImageRejectReason): OpenResult {
  return { kind: 'rejected', reason }
}

export function open(input: { readonly bytes: Uint8Array; readonly budget: ImageBudget }): Promise<OpenResult> {
  const pool = pools.get(input.budget)
  if (pool === undefined) return Promise.resolve(reject('decode'))
  const container = readContainer(input.bytes)
  if (typeof container === 'string') return Promise.resolve(reject(container))
  const mediaType = mediaTypeByFormat[container.format]
  if (!pool.formats.includes(mediaType)) return Promise.resolve(reject('format'))
  const oriented = orientedSize(container.width, container.height, container.orientation)
  const estimate = decodedBytes(oriented.width, oriented.height)
  if (oriented.width > pool.maxWidth) return Promise.resolve(reject('width'))
  if (oriented.height > pool.maxHeight) return Promise.resolve(reject('height'))
  if (estimate === undefined || estimate > pool.maxDecodedBytes) return Promise.resolve(reject('decoded-bytes'))
  if (pool.count + 1 > pool.maxConcurrentDecodes) return Promise.resolve(reject('concurrent'))
  if (pool.bytes + estimate > pool.maxInFlightBytes) return Promise.resolve(reject('in-flight-bytes'))
  pool.count += 1
  pool.bytes += estimate
  return finishOpen(input.bytes, pool, mediaType, oriented.width, oriented.height, estimate)
}

async function finishOpen(
  bytes: Uint8Array,
  pool: Pool,
  mediaType: ImageMediaType,
  width: number,
  height: number,
  estimate: number,
): Promise<OpenResult> {
  const decoded = await decodeRaster(bytes, width, height, estimate)
  if (decoded === undefined) {
    release(pool, estimate)
    return reject('decode')
  }
  return { kind: 'opened', ...createHandle(pool, decoded, width, height, estimate, mediaType, bytes) }
}

function release(pool: Pool, estimate: number): void {
  pool.count -= 1
  pool.bytes -= estimate
}

function createHandle(
  pool: Pool,
  raster: Buffer,
  width: number,
  height: number,
  estimate: number,
  mediaType: ImageMediaType,
  bytes: Uint8Array,
): { handle: OpenImageHandle; declaration: ImageDeclaration; verifiedBytes: Uint8Array } {
  let pixels: Buffer | null = raster
  let closed: ClosedImageHandle | undefined
  const handle: OpenImageHandle = {
    phase: 'open',
    async encode(request) {
      if (closed !== undefined || pixels === null) return { kind: 'rejected', reason: 'closed' }
      if (!IMAGE_FORMATS.includes(request.format)) return { kind: 'rejected', reason: 'encode' }
      const encoded = await encodeRaster(pixels, width, height, request.format)
      if (encoded === undefined) return { kind: 'rejected', reason: 'encode' }
      return {
        kind: 'encoded',
        mediaType: mediaTypeByFormat[request.format],
        bytes: encoded.bytes,
        orientation: 'absent',
        exif: 'absent',
      }
    },
    async close() {
      if (closed !== undefined) return { kind: 'closed', handle: closed }
      if (pixels === null) return { kind: 'still-open', handle }
      pixels = null
      release(pool, estimate)
      const settled: ClosedImageHandle = {
        phase: 'closed',
        reservation: 'released',
        nativeStop: 'not-proven',
        close() {
          return Promise.resolve(settled)
        },
      }
      closed = settled
      return { kind: 'closed', handle: settled }
    },
  }
  return {
    handle,
    declaration: { mediaType, orientedWidth: width, orientedHeight: height, trusted: false },
    verifiedBytes: bytes,
  }
}
