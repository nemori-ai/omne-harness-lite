import { z } from 'zod'
import type { ImagePreparePolicy } from './types.ts'
import { positive, format, background, bytesSchema, dataOnly } from '@omne-harness-lite/image-codec'
export {
  positive,
  format,
  bytesSchema,
  dataOnly,
  limitsSchema,
  encodeSchema,
  metadataSchema,
  encodedSchema,
  validateCodec,
} from '@omne-harness-lite/image-codec'
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
