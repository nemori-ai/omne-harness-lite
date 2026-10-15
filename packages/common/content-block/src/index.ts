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

export type ContentBlock =
  TextContentBlock | ThinkingContentBlock | MediaContentBlock | FileContentBlock

export type ContentBlockRejection = 'kind' | 'extra' | 'id' | 'visibility' | 'text' | 'media' | 'file'

export type ContentBlockJudgment =
  { readonly ok: ContentBlock } | { readonly rejected: ContentBlockRejection }

/** Legal keys of each kind. `judgeContentBlock` reads this table and does not keep a second list. */
const BLOCK_KEYS: Readonly<Record<ContentBlockKind, readonly string[]>> = {
  text: ['kind', 'id', 'visibility', 'text'],
  thinking: ['kind', 'id', 'visibility', 'text'],
  voice: ['kind', 'id', 'visibility', 'mediaType', 'inline'],
  image: ['kind', 'id', 'visibility', 'mediaType', 'inline'],
  file: ['kind', 'id', 'visibility', 'storage', 'key', 'mediaType'],
}

const VISIBILITY_KEYS = ['toHuman', 'toModel'] as const

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

/** Admit one closed content block. Tool calls, tool results, and growing blocks are rejected. */
export function judgeContentBlock(value: unknown): ContentBlockJudgment {
  if (!isRecord(value) || typeof value.kind !== 'string') return { rejected: 'kind' }
  if (!isContentBlockKind(value.kind)) return { rejected: 'kind' }
  const kind = value.kind
  if (hasUnknownKey(value, BLOCK_KEYS[kind])) return { rejected: 'extra' }
  if (isRecord(value.visibility) && hasUnknownKey(value.visibility, VISIBILITY_KEYS)) {
    return { rejected: 'extra' }
  }
  if (typeof value.id !== 'string' || value.id.length === 0) return { rejected: 'id' }
  const visibility = visibilityOf(value.visibility)
  if (visibility === undefined) return { rejected: 'visibility' }
  const id = value.id as BlockId
  if (value.kind === 'text' || value.kind === 'thinking') {
    if (typeof value.text !== 'string') return { rejected: 'text' }
    return { ok: { kind: value.kind, id, visibility, text: value.text } }
  }
  if (value.kind === 'voice' || value.kind === 'image') {
    if (typeof value.mediaType !== 'string' || typeof value.inline !== 'string')
      return { rejected: 'media' }
    return {
      ok: { kind: value.kind, id, visibility, mediaType: value.mediaType, inline: value.inline },
    }
  }
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
