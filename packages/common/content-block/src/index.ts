export const CONTENT_BLOCK_KINDS = ['text', 'thinking', 'voice', 'image', 'file'] as const

export type ContentBlockKind = (typeof CONTENT_BLOCK_KINDS)[number]

declare const blockIdBrand: unique symbol
export type BlockId = string & { readonly [blockIdBrand]: true }

export interface Visibility {
  readonly toHuman: boolean
  readonly toModel: boolean
}

export interface TextContentBlock {
  readonly kind: 'text'
  readonly id: BlockId
  readonly visibility: Visibility
  readonly text: string
}

export interface ThinkingContentBlock {
  readonly kind: 'thinking'
  readonly id: BlockId
  readonly visibility: Visibility
  readonly text: string
}

export interface MediaContentBlock {
  readonly kind: 'voice' | 'image'
  readonly id: BlockId
  readonly visibility: Visibility
  readonly mediaType: string
  readonly inline: string
}

export interface FileContentBlock {
  readonly kind: 'file'
  readonly id: BlockId
  readonly visibility: Visibility
  readonly storage: string
  readonly key: string
  readonly mediaType: string
}

/**
 * Where content is and how to check it. It is not a URL, a read capability, or a release grant.
 * `bytes` is a non-negative decimal integer string. The content provider names the digest
 * algorithm and encoding.
 */
export type ContentReference = Readonly<{
  storage: string
  key: string
  mediaType: string
  bytes: string
  digest: string
}>

/** A closed voice, image, or file block that points at content by `ref` instead of inline data. */
export type ReferenceContentBlock = Readonly<{
  kind: 'voice' | 'image' | 'file'
  id: BlockId
  visibility: Visibility
  ref: ContentReference
  transcript: string | null
}>

export type ContentBlock =
  | TextContentBlock
  | ThinkingContentBlock
  | MediaContentBlock
  | FileContentBlock
  | ReferenceContentBlock

export type ContentBlockRejection =
  | 'kind'
  | 'extra'
  | 'id'
  | 'visibility'
  | 'text'
  | 'media'
  | 'file'
  | 'ref'
  | 'storage'
  | 'key'
  | 'mediaType'
  | 'bytes'
  | 'digest'
  | 'transcript'

export type ContentBlockJudgment =
  | { readonly ok: ContentBlock }
  | { readonly rejected: ContentBlockRejection }

interface BlockRule {
  readonly keys: readonly string[]
  readonly admit: (
    value: Record<string, unknown>,
    id: BlockId,
    visibility: Visibility,
  ) => ContentBlockJudgment
}

function admitWritten(
  kind: 'text' | 'thinking',
  value: Record<string, unknown>,
  id: BlockId,
  visibility: Visibility,
): ContentBlockJudgment {
  if (typeof value.text !== 'string') return { rejected: 'text' }
  return { ok: { kind, id, visibility, text: value.text } }
}

function admitText(
  value: Record<string, unknown>,
  id: BlockId,
  visibility: Visibility,
): ContentBlockJudgment {
  return admitWritten('text', value, id, visibility)
}

function admitThinking(
  value: Record<string, unknown>,
  id: BlockId,
  visibility: Visibility,
): ContentBlockJudgment {
  return admitWritten('thinking', value, id, visibility)
}

function admitMedia(
  kind: 'voice' | 'image',
  value: Record<string, unknown>,
  id: BlockId,
  visibility: Visibility,
): ContentBlockJudgment {
  if (typeof value.mediaType !== 'string' || typeof value.inline !== 'string')
    return { rejected: 'media' }
  return { ok: { kind, id, visibility, mediaType: value.mediaType, inline: value.inline } }
}

function admitVoice(
  value: Record<string, unknown>,
  id: BlockId,
  visibility: Visibility,
): ContentBlockJudgment {
  return admitMedia('voice', value, id, visibility)
}

function admitImage(
  value: Record<string, unknown>,
  id: BlockId,
  visibility: Visibility,
): ContentBlockJudgment {
  return admitMedia('image', value, id, visibility)
}

function admitFile(
  value: Record<string, unknown>,
  id: BlockId,
  visibility: Visibility,
): ContentBlockJudgment {
  if (
    typeof value.storage !== 'string' ||
    typeof value.key !== 'string' ||
    typeof value.mediaType !== 'string'
  ) {
    return { rejected: 'file' }
  }
  return {
    ok: {
      kind: 'file',
      id,
      visibility,
      storage: value.storage,
      key: value.key,
      mediaType: value.mediaType,
    },
  }
}

/** One table for legal keys and admission. `judgeContentBlock` does not keep a second list. */
const BLOCKS: Readonly<Record<ContentBlockKind, BlockRule>> = {
  text: { keys: ['kind', 'id', 'visibility', 'text'], admit: admitText },
  thinking: { keys: ['kind', 'id', 'visibility', 'text'], admit: admitThinking },
  voice: { keys: ['kind', 'id', 'visibility', 'mediaType', 'inline'], admit: admitVoice },
  image: { keys: ['kind', 'id', 'visibility', 'mediaType', 'inline'], admit: admitImage },
  file: { keys: ['kind', 'id', 'visibility', 'storage', 'key', 'mediaType'], admit: admitFile },
}

const VISIBILITY_KEYS = ['toHuman', 'toModel'] as const

type ReferenceKind = ReferenceContentBlock['kind']

const REFERENCE_KINDS: readonly ReferenceKind[] = ['voice', 'image', 'file']
const REFERENCE_BLOCK_KEYS = ['kind', 'id', 'visibility', 'ref', 'transcript'] as const
const REFERENCE_KEYS = ['storage', 'key', 'mediaType', 'bytes', 'digest'] as const
const DECIMAL = /^(0|[1-9][0-9]*)$/u

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isContentBlockKind(kind: string): kind is ContentBlockKind {
  return (CONTENT_BLOCK_KINDS as readonly string[]).includes(kind)
}

function hasUnknownKey(value: Record<string, unknown>, legal: readonly string[]): boolean {
  const allowed = new Set<string>(legal)
  return Object.keys(value).some(key => !allowed.has(key))
}

function visibilityOf(value: unknown): Visibility | undefined {
  if (!isRecord(value)) return undefined
  if (typeof value.toHuman !== 'boolean' || typeof value.toModel !== 'boolean') return undefined
  return { toHuman: value.toHuman, toModel: value.toModel }
}

function isReferenceKind(kind: ContentBlockKind): kind is ReferenceKind {
  return (REFERENCE_KINDS as readonly string[]).includes(kind)
}

function isFilled(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

/** Shape only. It does not prove that the content exists, who owns it, or who may read it. */
function referenceOf(
  value: unknown,
): { readonly ok: ContentReference } | { readonly rejected: ContentBlockRejection } {
  if (!isRecord(value)) return { rejected: 'ref' }
  if (hasUnknownKey(value, REFERENCE_KEYS)) return { rejected: 'extra' }
  if (!isFilled(value.storage)) return { rejected: 'storage' }
  if (!isFilled(value.key)) return { rejected: 'key' }
  if (typeof value.mediaType !== 'string') return { rejected: 'mediaType' }
  if (typeof value.bytes !== 'string' || !DECIMAL.test(value.bytes)) return { rejected: 'bytes' }
  if (!isFilled(value.digest)) return { rejected: 'digest' }
  const { storage, key, mediaType, bytes, digest } = value
  return { ok: { storage, key, mediaType, bytes, digest } }
}

function admitReference(
  kind: ReferenceKind,
  value: Record<string, unknown>,
  id: BlockId,
  visibility: Visibility,
): ContentBlockJudgment {
  const ref = referenceOf(value.ref)
  if ('rejected' in ref) return ref
  const transcript = value.transcript
  if (transcript !== null && typeof transcript !== 'string') return { rejected: 'transcript' }
  return { ok: { kind, id, visibility, ref: ref.ok, transcript } }
}

function admitCommon(
  value: Record<string, unknown>,
  keys: readonly string[],
): { readonly id: BlockId; readonly visibility: Visibility } | ContentBlockRejection {
  if (hasUnknownKey(value, keys)) return 'extra'
  if (isRecord(value.visibility) && hasUnknownKey(value.visibility, VISIBILITY_KEYS)) {
    return 'extra'
  }
  if (typeof value.id !== 'string' || value.id.length === 0) return 'id'
  const visibility = visibilityOf(value.visibility)
  if (visibility === undefined) return 'visibility'
  return { id: value.id as BlockId, visibility }
}

/**
 * Admit one closed content block. Tool calls, tool results, and growing blocks are rejected.
 * An own `ref` key selects the reference form, which only voice, image, and file have.
 */
export function judgeContentBlock(value: unknown): ContentBlockJudgment {
  if (!isRecord(value) || typeof value.kind !== 'string') return { rejected: 'kind' }
  if (!isContentBlockKind(value.kind)) return { rejected: 'kind' }
  if (Object.hasOwn(value, 'ref')) {
    if (!isReferenceKind(value.kind)) return { rejected: 'kind' }
    const common = admitCommon(value, REFERENCE_BLOCK_KEYS)
    if (typeof common === 'string') return { rejected: common }
    return admitReference(value.kind, value, common.id, common.visibility)
  }
  const rule = BLOCKS[value.kind]
  const common = admitCommon(value, rule.keys)
  if (typeof common === 'string') return { rejected: common }
  return rule.admit(value, common.id, common.visibility)
}
