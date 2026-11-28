import type { ContentBlock, ContentReference } from '@omne-harness/content-block'
import type { LlmModelRequest, MediaMeasurementFact } from '@omne-harness/model-contract'
import type {
  MaterializeFailure,
  ModelMedia,
  ModelMediaFailure,
  ModelMediaLimits,
} from '@omne-harness/model-contract/provider'
import type { Outcome } from '@omne-harness/operation-result'
import type { JsonValue } from '@omne-harness/json-text'
import { list, object, text } from './chat-completions/json.ts'
import type { PiChatBinding, PiMaterializedMedia } from './family.ts'

/** Reads one medium for the send it was made for: the access is already bound into it. */
export type PiMediaReader = (
  reference: ContentReference,
  limits: ModelMediaLimits,
  signal: AbortSignal,
) => Promise<Outcome<ModelMedia, ModelMediaFailure>>

export function sameReference(left: ContentReference, right: ContentReference): boolean {
  return left.storage === right.storage && left.key === right.key && left.digest === right.digest
}

export type AcceptedMedia = Readonly<{
  prefix: string
  mediaTypes: readonly string[]
  maxBytes: number | undefined
}>
export type FileWire = Readonly<{ mediaTypes: readonly string[]; maxBytes: number }>
type MediaWire = Readonly<{
  image: Readonly<{ mediaTypes: readonly string[] }> | null
  voice?: Readonly<{ formats: Readonly<Record<string, string>> }>
  file?: FileWire
}>
const WORDS: AcceptedMedia = {
  prefix: 'text/plain',
  mediaTypes: ['text/plain'],
  maxBytes: undefined,
}

export function acceptedLimits(accepted: readonly AcceptedMedia[]): PiChatBinding['mediaLimits'] {
  return reference => {
    const kind = accepted.find(each => reference.mediaType.startsWith(each.prefix))
    if (kind === undefined) return null
    const maxBytes = kind.maxBytes ?? Number.MAX_SAFE_INTEGER
    return { mediaTypes: kind.mediaTypes, maxBytes, image: null }
  }
}

/** Images, speech and files as the wire of a record takes them; words kept apart are always taken. */
export function wireLimits(
  wire: MediaWire,
  bytes: Readonly<{ image?: number | undefined; voice?: number | undefined }>,
): PiChatBinding['mediaLimits'] {
  const { image, voice, file } = wire
  return acceptedLimits([
    ...(image === null ? [] : [{ prefix: 'image/', ...image, maxBytes: bytes.image }]),
    ...(voice === undefined
      ? []
      : [{ prefix: 'audio/', mediaTypes: Object.keys(voice.formats), maxBytes: bytes.voice }]),
    ...(file?.mediaTypes.map(type => ({
      prefix: type,
      mediaTypes: [type],
      maxBytes: file.maxBytes,
    })) ?? []),
    WORDS,
  ])
}

type Seen = Readonly<{ path: string; reference: ContentReference }>
function referencesOf(request: LlmModelRequest): readonly Seen[] {
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
    request: LlmModelRequest
    binding: Pick<PiChatBinding, 'mediaLimits' | 'adoption'>
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
export type ReferredMedium = Readonly<{ mime: string | null; data: string }>
export type MediaView = Readonly<{
  read(block: Referring): ReferredMedium | null
  facts: MediaMeasurementFact[]
  pending: ContentReference[]
  files: ContentReference[]
}>

export function mediaRead(media: readonly PiMaterializedMedia[]): MediaView {
  const facts: MediaMeasurementFact[] = []
  return {
    facts,
    pending: [],
    files: [],
    read(block) {
      const read = media.find(each => sameReference(each.reference, block.ref))
      if (read === undefined) return null
      facts.push(read.measurement)
      return { mime: read.mime, data: Buffer.from(read.bytes).toString('base64') }
    },
  }
}

function plannedFact(block: Referring): MediaMeasurementFact | null {
  const { ref, facts: measured } = block
  const head = { reference: ref, bytes: ref.bytes, mediaType: ref.mediaType }
  if (measured?.kind === 'image')
    return {
      ...head,
      kind: 'image',
      widthPixels: String(measured.widthPixels),
      heightPixels: String(measured.heightPixels),
    }
  if (measured?.kind === 'voice')
    return {
      ...head,
      kind: 'voice',
      durationMs: String(measured.durationMs),
      sampleRate: String(measured.sampleRate),
      channels: String(measured.channels),
    }
  return null
}

export function mediaPending(): MediaView {
  const facts: MediaMeasurementFact[] = []
  const pending: ContentReference[] = []
  return {
    facts,
    pending,
    files: [],
    read(block) {
      if (!pending.some(each => sameReference(each, block.ref))) pending.push(block.ref)
      const fact = plannedFact(block)
      if (fact !== null) facts.push(fact)
      return { mime: null, data: '' }
    },
  }
}

function referredImage(
  block: Referring,
  mediaTypes: readonly string[] | undefined,
  view: MediaView,
): Readonly<{ mime: string; data: string }> | null {
  if (block.kind !== 'image' || mediaTypes === undefined) return null
  const found = view.read(block)
  if (found === null) return null
  const [first] = mediaTypes
  const planned = mediaTypes.includes(block.ref.mediaType) ? block.ref.mediaType : first
  const mime = found.mime ?? planned
  return mime === undefined || !mediaTypes.includes(mime) ? null : { mime, data: found.data }
}

/** The image a block sends, inline or by reference; null when this model cannot be sent the block. */
export function sentImage(
  block: ContentBlock,
  mediaTypes: readonly string[] | undefined,
  view: MediaView,
): Readonly<{ mime: string; data: string }> | null {
  if ('ref' in block) return referredImage(block, mediaTypes, view)
  if (block.kind !== 'image' || !(mediaTypes?.includes(block.mediaType) ?? false)) return null
  return { mime: block.mediaType, data: block.inline }
}

export function sentVoice(
  block: ContentBlock,
  formats: Readonly<Record<string, string>> | undefined,
  view: MediaView,
): Readonly<{ format: string; data: string }> | null {
  if (!('ref' in block) || formats === undefined) return null
  const found = view.read(block)
  if (found === null) return null
  const format = formats[found.mime ?? block.ref.mediaType]
  return format === undefined ? null : { format, data: found.data }
}

const EXTENSIONS: Readonly<Record<string, string>> = { 'application/pdf': 'pdf' }

export function sentFile(
  block: ContentBlock,
  file: FileWire | undefined,
  view: MediaView,
): Readonly<{ mime: string; data: string; filename: string }> | null {
  if (!('ref' in block) || file === undefined) return null
  const found = view.read(block)
  if (found === null) return null
  const mime = found.mime ?? block.ref.mediaType
  if (!file.mediaTypes.includes(mime)) return null
  view.files.push(block.ref)
  const extension = EXTENSIONS[mime]
  return {
    mime,
    data: found.data,
    filename: extension === undefined ? block.id : `${block.id}.${extension}`,
  }
}

/** Words a medium was made into and kept apart, read back as words; null for anything else. */
export function sentWords(block: ContentBlock, view: MediaView): string | null {
  if (!('ref' in block) || block.ref.mediaType !== WORDS.prefix) return null
  const found = view.read(block)
  return found === null ? null : Buffer.from(found.data, 'base64').toString('utf8')
}

/** The gateway parses a file the model reads natively only when told so (MD-46). */
export function nativeParsing(view: MediaView): JsonValue | undefined {
  if (view.files.length === 0) return undefined
  return list([object({ id: text('file-parser'), pdf: object({ engine: text('native') }) })])
}
