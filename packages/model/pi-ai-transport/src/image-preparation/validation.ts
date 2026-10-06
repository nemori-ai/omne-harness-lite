import { z } from 'zod'
import { types } from 'node:util'
import type { ImagePreparePolicy } from './types.ts'
import type { LoadedImageCodec } from '@omne-harness-lite/model-request-runtime'
export const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
const background = z
  .object({
    r: z.number().int().min(0).max(255),
    g: z.number().int().min(0).max(255),
    b: z.number().int().min(0).max(255),
  })
  .strict()
  .nullable()
export const format = z.enum(['png', 'jpeg', 'webp'])
export const limitsSchema = z.object({ maxPixels: positive, maxDimension: positive }).strict()
export const encodeSchema = z
  .object({
    format,
    width: positive,
    height: positive,
    quality: positive.max(100).nullable(),
    pngCompressionLevel: z.number().int().min(0).max(9),
    webpEffort: z.number().int().min(0).max(6),
    alphaBackground: background,
  })
  .strict()
export const policySchema = z
  .object({
    sourceMaxBytes: positive,
    decodedMaxPixels: positive,
    decodedMaxDimension: positive,
    maxConcurrent: positive,
    maxInFlightBytes: positive,
    candidateMaxBytes: positive,
    maxAttemptsPerImage: positive,
    maxCacheBytes: positive,
    maxCacheEntries: positive,
    minWidth: positive,
    minHeight: positive,
    maxWidth: positive,
    maxHeight: positive,
    qualitySteps: z.array(positive.max(100)).nonempty(),
    sizeScaleSteps: z.array(z.number().positive().max(1)).nonempty(),
    outputFormats: z.array(format).nonempty(),
    alphaBackground: background,
  })
  .strict()
export const metadataSchema = z
  .object({
    mediaType: z.string().min(1),
    width: positive,
    height: positive,
    pages: positive,
    orientation: z.union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
      z.literal(6),
      z.literal(7),
      z.literal(8),
    ]),
    hasAlpha: z.boolean(),
  })
  .strict()
const typedArrayPrototype: object = Object.getPrototypeOf(Uint8Array.prototype)
const actualBuffer = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer')?.get
function validBytes(value: unknown): value is Uint8Array {
  if (types.isProxy(value) || !(value instanceof Uint8Array) || !actualBuffer) return false
  // Admission reads these lengths before making an owned copy. Reject shadowed
  // view properties so a getter/value cannot spoof size or shared ownership.
  let current: object | null = value
  while (current && current !== typedArrayPrototype) {
    if (types.isProxy(current)) return false
    if (
      ['buffer', 'byteLength', 'byteOffset', 'length'].some(
        key => Object.getOwnPropertyDescriptor(current, key) !== undefined,
      )
    )
      return false
    const prototype: unknown = Object.getPrototypeOf(current)
    if (prototype !== null && typeof prototype !== 'object') return false
    current = prototype
  }
  const buffer: unknown = actualBuffer.call(value)
  return current === typedArrayPrototype && buffer instanceof ArrayBuffer
}
export const bytesSchema = z.custom<Uint8Array>(validBytes)
export const encodedSchema = z
  .object({ bytes: bytesSchema, mediaType: z.string().min(1), width: positive, height: positive })
  .strict()
export const inputSchema = z
  .object({
    images: z.array(
      z
        .object({
          position: z.string().min(1),
          bytes: bytesSchema,
          mediaType: z.string().min(1),
          targetMaxBytes: positive,
        })
        .strict(),
    ),
    maxRequestBytes: positive.nullable(),
    nonImageWireBytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    signal: z.custom<AbortSignal>(value => value instanceof AbortSignal),
  })
  .strict()
/** Inspect descriptors before reading members, so validation cannot invoke getters. */
export function dataOnly(value: unknown, seen = new WeakSet<object>()): boolean {
  if (types.isProxy(value)) return false
  if (
    value === null ||
    typeof value !== 'object' ||
    value instanceof Uint8Array ||
    value instanceof AbortSignal
  )
    return true
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    return false
  if (seen.has(value)) return false
  seen.add(value)
  const valid = Reflect.ownKeys(value).every(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    return descriptor !== undefined && 'value' in descriptor && dataOnly(descriptor.value, seen)
  })
  seen.delete(value)
  return valid
}
export function ownPolicy(value: ImagePreparePolicy): ImagePreparePolicy {
  if (!dataOnly(value)) throw new TypeError('Invalid image policy')
  const parsed = policySchema.safeParse(value)
  if (!parsed.success) throw new TypeError('Invalid image policy')
  const p = parsed.data
  if (
    p.minWidth > p.maxWidth ||
    p.minHeight > p.maxHeight ||
    new Set(p.outputFormats).size !== p.outputFormats.length ||
    !p.qualitySteps.every((n, i, a) => i === 0 || n < (a[i - 1] ?? n)) ||
    !p.sizeScaleSteps.every((n, i, a) => i === 0 || n < (a[i - 1] ?? n))
  )
    throw new TypeError('Invalid image policy')
  return p
}
export function validateCodec(codec: LoadedImageCodec): void {
  if (!codec || typeof codec !== 'object' || types.isProxy(codec))
    throw new TypeError('Invalid loaded codec')
  const keys = [
    'name',
    'revision',
    'inputMediaTypes',
    'outputFormats',
    'available',
    'inspect',
    'decode',
  ]
  const descriptors = Object.getOwnPropertyDescriptors(codec)
  if (
    Reflect.ownKeys(descriptors).length !== keys.length ||
    keys.some(key => !descriptors[key] || !('value' in descriptors[key]))
  )
    throw new TypeError('Invalid loaded codec')
  if (!codecIdentity(codec) || !codecMedia(codec)) throw new TypeError('Invalid loaded codec')
}

function codecIdentity(codec: LoadedImageCodec): boolean {
  if (
    typeof codec.name !== 'string' ||
    !codec.name ||
    typeof codec.revision !== 'string' ||
    !codec.revision ||
    typeof codec.available !== 'function' ||
    typeof codec.inspect !== 'function' ||
    typeof codec.decode !== 'function'
  )
    return false
  return true
}

function codecMedia(codec: LoadedImageCodec): boolean {
  if (
    !dataOnly(codec.inputMediaTypes) ||
    !dataOnly(codec.outputFormats) ||
    !Array.isArray(codec.inputMediaTypes) ||
    !codec.inputMediaTypes.length ||
    !codec.inputMediaTypes.every(s => typeof s === 'string' && s.length > 0) ||
    new Set(codec.inputMediaTypes).size !== codec.inputMediaTypes.length ||
    !Array.isArray(codec.outputFormats) ||
    !codec.outputFormats.length ||
    !codec.outputFormats.every(s => format.safeParse(s).success) ||
    new Set(codec.outputFormats).size !== codec.outputFormats.length
  )
    return false
  return true
}
