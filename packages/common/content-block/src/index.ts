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

export type ContentBlockRejection = 'kind' | 'id' | 'visibility' | 'text' | 'media' | 'file'

export type ContentBlockJudgment =
  { readonly ok: ContentBlock } | { readonly rejected: ContentBlockRejection }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function visibilityOf(value: unknown): Visibility | undefined {
  if (!isRecord(value)) return undefined
  if (typeof value.toHuman !== 'boolean' || typeof value.toModel !== 'boolean') return undefined
  return { toHuman: value.toHuman, toModel: value.toModel }
}

/** Admit one closed content block. Tool calls, tool results, and growing blocks are rejected. */
export function judgeContentBlock(value: unknown): ContentBlockJudgment {
  if (!isRecord(value) || typeof value.kind !== 'string') return { rejected: 'kind' }
  if (!CONTENT_BLOCK_KINDS.includes(value.kind as ContentBlockKind)) return { rejected: 'kind' }
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
