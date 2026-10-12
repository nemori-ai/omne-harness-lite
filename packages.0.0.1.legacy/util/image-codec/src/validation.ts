import { z } from 'zod'
import { types } from 'node:util'
import type { LoadedImageCodec } from './types.ts'
export const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
export const background = z
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
function shadowedView(value: object): boolean {
  if (types.isProxy(value)) return true
  return ['buffer', 'byteLength', 'byteOffset', 'length'].some(
    key => Object.getOwnPropertyDescriptor(value, key) !== undefined,
  )
}
function validBytes(value: unknown): value is Uint8Array {
  if (types.isProxy(value) || !(value instanceof Uint8Array) || !actualBuffer) return false
  // Admission reads these lengths before making an owned copy. Reject shadowed
  // view properties so a getter/value cannot spoof size or shared ownership.
  let current: object | null = value
  while (current && current !== typedArrayPrototype) {
    if (shadowedView(current)) return false
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
function runtimeLeaf(value: object): value is Uint8Array | AbortSignal {
  return value instanceof Uint8Array || value instanceof AbortSignal
}
function plainContainer(value: object): boolean {
  const prototype = Object.getPrototypeOf(value)
  return Array.isArray(value) || prototype === Object.prototype || prototype === null
}
/** Inspect descriptors before reading members, so validation cannot invoke getters. */
export function dataOnly(value: unknown, seen = new WeakSet<object>()): boolean {
  if (types.isProxy(value)) return false
  if (value === null || typeof value !== 'object' || runtimeLeaf(value)) return true
  if (!plainContainer(value)) return false
  if (seen.has(value)) return false
  seen.add(value)
  const valid = Reflect.ownKeys(value).every(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    return descriptor !== undefined && 'value' in descriptor && dataOnly(descriptor.value, seen)
  })
  seen.delete(value)
  return valid
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

function validCollection(value: unknown, check: (item: unknown) => boolean): boolean {
  if (!dataOnly(value) || !Array.isArray(value) || !value.length) return false
  return value.every(check) && new Set(value).size === value.length
}
function codecMedia(codec: LoadedImageCodec): boolean {
  return (
    validCollection(codec.inputMediaTypes, item => typeof item === 'string' && item.length > 0) &&
    validCollection(codec.outputFormats, item => format.safeParse(item).success)
  )
}
