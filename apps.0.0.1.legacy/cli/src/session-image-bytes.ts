import {
  jsonNumberSource,
  type AttachmentRef,
  type ContentBlock,
} from '@omne-harness-lite/content-blocks'
import { type Message } from '@omne-harness-lite/messages'

type Limits = { readonly maxImages: number; readonly maxBytes: number }
type ReadImage = (reference: AttachmentRef) => Promise<Uint8Array | undefined>
type SizedImage = { readonly reference: AttachmentRef; readonly bytes: number }

function visibleImages(block: ContentBlock): readonly AttachmentRef[] {
  if (!block.visibility.toModel) return []
  if (block.kind === 'tool_result') return block.blocks.flatMap(visibleImages)
  const own = block.kind === 'image' && !('inline' in block.data) ? [block.data] : []
  const rendered =
    'renderings' in block
      ? (block.renderings ?? []).flatMap(rendering => rendering.blocks.flatMap(visibleImages))
      : []
  return [...own, ...rendered]
}
function imageReferences(messages: readonly Message[], limits: Limits) {
  const images = new Map<string, SizedImage>()
  let total = 0
  for (const reference of messages.flatMap(message => message.blocks.flatMap(visibleImages))) {
    const key = JSON.stringify(reference)
    if (images.has(key)) continue
    const bytes = reference.bytes === undefined ? NaN : Number(jsonNumberSource(reference.bytes))
    if (
      !Number.isSafeInteger(bytes) ||
      bytes < 0 ||
      total + bytes > limits.maxBytes ||
      images.size >= limits.maxImages
    )
      throw new Error('Image input exceeds its byte or count limit')
    total += bytes
    images.set(key, { reference, bytes })
  }
  return images
}
/** Read only the current Session's authorized, immutable tool attachments. */
export function createSessionImageBytes(read: ReadImage, limits: Limits) {
  if (![limits.maxImages, limits.maxBytes].every(n => Number.isSafeInteger(n) && n > 0))
    throw new TypeError('positive image message limits required')
  const policy = Object.freeze({ ...limits })
  return async (messages: readonly Message[]) => {
    const references = imageReferences(messages, policy)
    if (!references.size) return { imageBytes: [] }
    const imageBytes: { reference: AttachmentRef; bytes: Uint8Array }[] = []
    for (const image of references.values()) {
      const bytes = await read(image.reference)
      if (!bytes || bytes.byteLength !== image.bytes) return { unavailable: true as const }
      imageBytes.push(Object.freeze({ reference: image.reference, bytes: new Uint8Array(bytes) }))
    }
    return { imageBytes: Object.freeze(imageBytes) }
  }
}
