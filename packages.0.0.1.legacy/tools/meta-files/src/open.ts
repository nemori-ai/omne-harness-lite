import type { ImageMetadata, DecodeLimits } from '@omne-harness-lite/image-codec'
import type { FilesSupport } from './types.ts'
import type { FileCall } from './mutations.ts'
import { argumentSchemas } from './arguments.ts'
import { readWhole } from './values.ts'
import { imageReply, rejected } from './result.ts'
function validDimensions(metadata: ImageMetadata, limits: DecodeLimits): boolean {
  const positive = (value: number) => Number.isSafeInteger(value) && value > 0
  return (
    positive(metadata.width) &&
    positive(metadata.height) &&
    metadata.width <= limits.maxDimension &&
    metadata.height <= limits.maxDimension &&
    metadata.width <= Math.floor(limits.maxPixels / metadata.height)
  )
}
function unsupportedImage(metadata: ImageMetadata, support: FilesSupport): string | undefined {
  if (
    !imageTypes.has(metadata.mediaType) ||
    !support.imageCodec.inputMediaTypes.includes(metadata.mediaType)
  )
    return 'image:unsupported'
  if (metadata.pages !== 1) return 'image:animatedUnsupported'
  return undefined
}
async function validateRaster(
  bytes: Uint8Array,
  metadata: ImageMetadata,
  limits: DecodeLimits,
  support: FilesSupport,
) {
  const decoded = await support.imageCodec.decode(bytes, metadata, limits)
  if ('failure' in decoded) return { error: rejected(`image:${decoded.failure}`) }
  try {
    return { width: decoded.ok.width, height: decoded.ok.height }
  } finally {
    await decoded.ok.close()
  }
}
async function inspectImage(bytes: Uint8Array, limits: DecodeLimits, support: FilesSupport) {
  const observed = await support.imageCodec.inspect(bytes, limits)
  if ('failure' in observed) return { error: rejected(`image:${observed.failure}`) }
  const unsupported = unsupportedImage(observed.ok, support)
  if (unsupported) return { error: rejected(unsupported) }
  if (!validDimensions(observed.ok, limits)) return { error: rejected('capacity:imageDimensions') }
  return { metadata: observed.ok }
}
const imageTypes = new Set(['image/png', 'image/jpeg', 'image/webp'])
export async function openImage(input: unknown, call: FileCall, support: FilesSupport) {
  const args = argumentSchemas.open.parse(input)
  const writer = call.deps.attachments
  if (!writer) return rejected('attachment:unavailable')
  const codec = support.imageCodec
  if (!codec.available()) return rejected('image:unavailable')
  const path = call.resolve(args.path)
  const original = await readWhole(call.files, path, call.options.maxImageBytes)
  if ('error' in original) return original.error
  const bytes = new Uint8Array(original.ok.data)
  const limits = {
    maxPixels: call.options.maxImagePixels,
    maxDimension: call.options.maxImageDimension,
  }
  if (call.deps.signal.aborted) return rejected('interrupted')
  const observed = await inspectImage(bytes, limits, support)
  if ('error' in observed) return observed.error
  const metadata = observed.metadata
  if (call.deps.signal.aborted) return rejected('interrupted')
  const decoded = await validateRaster(bytes, metadata, limits, support)
  if ('error' in decoded) return decoded.error
  if (call.deps.signal.aborted) return rejected('interrupted')
  const stored = await writer.putAttachment('files.open.image', bytes, metadata.mediaType, path)
  if (stored.kind !== 'stored')
    return rejected(
      `attachment:${stored.reason}`,
      'No confirmed image reference is available. An unknown write receipt does not prove that no bytes were stored.',
    )
  // A stop after the confirmed write does not erase that acknowledged effect.
  return imageReply(stored.reference, metadata.mediaType, path, decoded.width, decoded.height)
}
