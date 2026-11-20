import type { ContentBlock, ContentReference } from '@omne-harness/content-block'
import type { FixedModelRequest, MediaMeasurementFact } from '@omne-harness/model-contract'
import type {
  MaterializeFailure,
  ModelMedia,
  ModelMediaFailure,
  ModelMediaLimits,
} from '@omne-harness/model-contract/provider'
import type { Outcome } from '@omne-harness/operation-result'
import type { PiFamilyBinding, PiMaterializedMedia } from './family.ts'

/** Reads one medium for the send it was made for: the access is already bound into it. */
export type PiMediaReader = (
  reference: ContentReference,
  limits: ModelMediaLimits,
  signal: AbortSignal,
) => Promise<Outcome<ModelMedia, ModelMediaFailure>>

export function sameReference(left: ContentReference, right: ContentReference): boolean {
  return left.storage === right.storage && left.key === right.key && left.digest === right.digest
}

/** What a model that takes these image types takes of a referenced image; null for anything else. */
export function imageLimits(
  image: Readonly<{ mediaTypes: readonly string[] }> | null,
  maxBytes: number | undefined,
): PiFamilyBinding['mediaLimits'] {
  return reference =>
    image === null || !reference.mediaType.startsWith('image/')
      ? null
      : { mediaTypes: image.mediaTypes, maxBytes: maxBytes ?? Number.MAX_SAFE_INTEGER, image: null }
}

type Seen = Readonly<{ path: string; reference: ContentReference }>
function referencesOf(request: FixedModelRequest): readonly Seen[] {
  const seen: Seen[] = []
  const visit = (block: ContentBlock, path: string): void => {
    if (!block.visibility.toModel || !('ref' in block)) return
    if (!seen.some(each => sameReference(each.reference, block.ref)))
      seen.push({ path, reference: block.ref })
  }
  for (const [index, block] of request.system.entries()) visit(block, `/system/${index}`)
  for (const [index, message] of request.messages.entries())
    for (const [part, block] of message.blocks.entries())
      visit(block as ContentBlock, `/messages/${index}/blocks/${part}`)
  return seen
}

const absent = (diagnostic: string): MaterializeFailure => ({
  kind: 'unavailable',
  dependency: 'model-media',
  diagnostic,
})

async function readOne(
  read: PiMediaReader,
  reference: ContentReference,
  limits: ModelMediaLimits,
  signal: AbortSignal,
): Promise<Outcome<PiMaterializedMedia, MaterializeFailure>> {
  const over: MaterializeFailure = {
    kind: 'media',
    reference,
    reason: 'over-limit',
    limit: String(limits.maxBytes),
  }
  let answer: Awaited<ReturnType<PiMediaReader>>
  try {
    answer = await read(reference, limits, signal)
  } catch {
    return { failure: absent('media-source-failed') }
  }
  if ('failure' in answer) {
    const { failure } = answer
    if (failure.kind === 'unavailable') return { failure: absent(failure.diagnostic) }
    if (failure.kind === 'too-large') return { failure: over }
    return { failure: { kind: 'media', reference, reason: 'material-unavailable' } }
  }
  const { mediaType, bytes, measurement } = answer.ok
  if (bytes.byteLength > limits.maxBytes || !limits.mediaTypes.includes(mediaType))
    return { failure: over }
  return { ok: { reference, mime: mediaType, bytes, measurement } }
}

/** Reads what the request refers to, at this materialization and by reference (MD-45). */
export async function gatherMedia(
  input: Readonly<{
    request: FixedModelRequest
    binding: PiFamilyBinding
    read: PiMediaReader | undefined
    signal: AbortSignal
  }>,
): Promise<Outcome<readonly PiMaterializedMedia[], MaterializeFailure>> {
  const { request, binding, read, signal } = input
  const media: PiMaterializedMedia[] = []
  for (const { path, reference } of referencesOf(request)) {
    const limits = binding.mediaLimits(reference)
    if (limits === null)
      return { failure: { kind: 'unsupported', field: path, adapter: binding.adoption } }
    if (read === undefined) return { failure: absent('media-source-absent') }
    const one = await readOne(read, reference, limits, signal)
    if (!('ok' in one)) return one
    media.push(one.ok)
  }
  return { ok: media }
}

type Referring = Extract<ContentBlock, { ref: ContentReference }>
export type ReferredImage = Readonly<{ mime: string | null; data: string }>
export type MediaView = Readonly<{
  image(block: Referring): ReferredImage | null
  facts: MediaMeasurementFact[]
  pending: ContentReference[]
}>

/** The images of a request being sent: the bytes that were read for it at this materialization. */
export function mediaRead(media: readonly PiMaterializedMedia[]): MediaView {
  const facts: MediaMeasurementFact[] = []
  return {
    facts,
    pending: [],
    image(block) {
      const read = media.find(each => sameReference(each.reference, block.ref))
      if (read === undefined) return null
      facts.push(read.measurement)
      return { mime: read.mime, data: Buffer.from(read.bytes).toString('base64') }
    },
  }
}

/** The images of a request being planned: nothing is read, the block's own facts stand for it. */
export function mediaPending(): MediaView {
  const facts: MediaMeasurementFact[] = []
  const pending: ContentReference[] = []
  return {
    facts,
    pending,
    image(block) {
      const { ref, facts: measured } = block
      if (!pending.some(each => sameReference(each, ref))) pending.push(ref)
      if (measured?.kind === 'image')
        facts.push({
          reference: ref,
          bytes: ref.bytes,
          mediaType: ref.mediaType,
          kind: 'image',
          widthPixels: String(measured.widthPixels),
          heightPixels: String(measured.heightPixels),
        })
      return { mime: null, data: '' }
    },
  }
}

/** The data URL parts of an image by reference, or null when this model cannot be sent it. */
export function referredImage(
  block: Referring,
  mediaTypes: readonly string[] | undefined,
  view: MediaView,
): Readonly<{ mime: string; data: string }> | null {
  if (block.kind !== 'image' || mediaTypes === undefined) return null
  const found = view.image(block)
  if (found === null) return null
  const [first] = mediaTypes
  const planned = mediaTypes.includes(block.ref.mediaType) ? block.ref.mediaType : first
  const mime = found.mime ?? planned
  return mime === undefined || !mediaTypes.includes(mime) ? null : { mime, data: found.data }
}
