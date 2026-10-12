import { parseOpaqueIdentifier, type OpaqueIdentifier } from '@omne-harness-lite/identity-values'
import { copyJsonValue, toOpaqueJson, type JsonValue } from './json.ts'
import { isObject, validate } from './schema.ts'
import type {
  AttachmentRef,
  BlockId,
  CallId,
  CapabilityId,
  ContentBlock,
  ContentBlockJudgment,
  ContentBlockRejection,
  DerivedRendering,
  Modality,
  RenderingBlock,
  ResultContentBlock,
  Wire,
} from './types.ts'

export function isCanonicalMediaType(value: unknown): value is string {
  return validate('MediaType', value).valid
}

/** S-6: no modality is represented by undefined, never a fifth modality token. */
export function modalityOf(mediaType: string): Modality | undefined {
  const type = mediaType.split('/')[0]
  return type === 'text' || type === 'image' || type === 'audio' || type === 'video'
    ? type
    : undefined
}

export function capabilityIdEquals(a: CapabilityId, b: CapabilityId): boolean {
  return a.category === b.category && a.name === b.name
}
export function attachmentRefEquals(a: AttachmentRef, b: AttachmentRef): boolean {
  return a.storage === b.storage && a.key === b.key
}

const KINDS: readonly string[] = Object.freeze([
  'text',
  'thinking',
  'voice',
  'image',
  'file',
  'tool_call',
  'tool_result',
])
interface LocatedBlock {
  readonly value: Record<string, JsonValue>
  readonly inResult: boolean
}

function collectBlocks(value: JsonValue): readonly LocatedBlock[] {
  const blocks: LocatedBlock[] = []
  const pending = [{ value, inResult: false }]
  while (pending.length > 0) {
    const located = pending.pop()
    if (located === undefined || !isObject(located.value)) continue
    const block = located.value
    blocks.push({ value: block, inResult: located.inResult })
    if (block.kind === 'tool_result' && Array.isArray(block.blocks)) {
      for (const child of block.blocks) pending.push({ value: child, inResult: true })
    }
    if (Array.isArray(block.renderings)) {
      for (const rendering of block.renderings) {
        if (isObject(rendering) && Array.isArray(rendering.blocks)) {
          for (const child of rendering.blocks)
            pending.push({ value: child, inResult: located.inResult })
        }
      }
    }
  }
  return blocks
}

function visibilityMissing(block: Record<string, JsonValue>): boolean {
  if (!Object.hasOwn(block, 'visibility')) return true
  const visibility = block.visibility
  return (
    isObject(visibility) &&
    (!Object.hasOwn(visibility, 'toHuman') || !Object.hasOwn(visibility, 'toModel'))
  )
}
function incompleteVisible(block: Record<string, JsonValue>): boolean {
  return (
    block.kind === 'tool_call' &&
    block.complete === false &&
    isObject(block.visibility) &&
    (block.visibility.toHuman === true || block.visibility.toModel === true)
  )
}
function modalityMismatch(block: Record<string, JsonValue>): boolean {
  if (block.kind !== 'voice' && block.kind !== 'image') return false
  const expected = block.kind === 'voice' ? 'audio' : 'image'
  const mediaTypes = [block.mediaType, isObject(block.data) ? block.data.mediaType : undefined]
  return mediaTypes.some(type => isCanonicalMediaType(type) && modalityOf(type) !== expected)
}

function blockModality(block: Record<string, JsonValue>): Modality | undefined {
  switch (block.kind) {
    case 'text':
    case 'thinking':
    case 'tool_call':
      return 'text'
    case 'voice':
      return 'audio'
    case 'image':
      return 'image'
    case 'file':
      return isObject(block.attachment) && typeof block.attachment.mediaType === 'string'
        ? modalityOf(block.attachment.mediaType)
        : undefined
    default:
      return undefined
  }
}
function mediaTypesAgree(block: Record<string, JsonValue>): boolean {
  return !(
    (block.kind === 'voice' || block.kind === 'image') &&
    isObject(block.data) &&
    Object.hasOwn(block.data, 'mediaType') &&
    block.mediaType !== block.data.mediaType
  )
}
function renderingModalitiesDiffer(block: Record<string, JsonValue>): boolean {
  if (!Array.isArray(block.renderings)) return true
  const originalModality = blockModality(block)
  if (originalModality === undefined) return true
  for (const rendering of block.renderings) {
    if (!isObject(rendering) || !Array.isArray(rendering.blocks)) continue
    if (
      rendering.blocks.some(child => isObject(child) && blockModality(child) === originalModality)
    )
      return false
  }
  return true
}
function crossMembersValid(blocks: readonly LocatedBlock[]): boolean {
  for (const { value: block } of blocks) {
    if (!mediaTypesAgree(block) || !renderingModalitiesDiffer(block)) return false
  }
  return true
}

/** S-26: every named predicate runs over the whole block tree before the remaining Schema test. */
export function judgeContentBlock(value: unknown): ContentBlockJudgment {
  const copied = copyJsonValue(value)
  if ('failed' in copied) return Object.freeze({ rejected: 'malformed' } as const)
  const blocks = collectBlocks(copied.ok)
  const rejections: readonly {
    readonly reason: ContentBlockRejection
    readonly test: () => boolean
  }[] = [
    {
      reason: 'kind_unknown',
      test: () =>
        blocks.some(
          ({ value: block }) =>
            Object.hasOwn(block, 'kind') &&
            (typeof block.kind !== 'string' || !KINDS.includes(block.kind)),
        ),
    },
    {
      reason: 'visibility_missing',
      test: () => blocks.some(({ value: block }) => visibilityMissing(block)),
    },
    {
      reason: 'incomplete_call_visible',
      test: () => blocks.some(({ value: block }) => incompleteVisible(block)),
    },
    {
      reason: 'call_in_result',
      test: () =>
        blocks.some(({ value: block, inResult }) => inResult && block.kind === 'tool_call'),
    },
    {
      reason: 'modality_mismatch',
      test: () => blocks.some(({ value: block }) => modalityMismatch(block)),
    },
  ]
  for (const rejection of rejections) {
    if (rejection.test()) return Object.freeze({ rejected: rejection.reason })
  }
  // Schema is a remaining-shape check; Ajv errors never select a rejection name.
  if (!isWireContentBlock(copied.ok) || !crossMembersValid(blocks))
    return Object.freeze({ rejected: 'malformed' } as const)
  return Object.freeze({ ok: brandBlock(copied.ok) })
}

/**
 * Restore the TypeScript representation after a complete frozen-Schema shape check.
 * This adapter does not establish the additional S-26 cross-member predicates.
 */
export function contentBlockFromRepresentation(value: unknown): ContentBlock {
  const copied = copyJsonValue(value)
  if ('failed' in copied || !isWireContentBlock(copied.ok))
    throw new TypeError('ContentBlock Schema representation required')
  return brandBlock(copied.ok)
}

function isWireContentBlock(value: JsonValue): value is JsonValue & Wire<ContentBlock> {
  return validate('ContentBlock', value).valid
}
function identifier<Brand extends string>(value: string, brand: Brand): OpaqueIdentifier<Brand> {
  const parsed = parseOpaqueIdentifier(value, brand)
  if (!('ok' in parsed)) throw new Error('validated identity failed branding')
  return parsed.ok
}

function brandRendering(block: Wire<RenderingBlock>): RenderingBlock {
  return Object.freeze({ ...block, id: identifier(block.id, 'BlockId') })
}
function brandDerivation(rendering: Wire<DerivedRendering>): DerivedRendering {
  return Object.freeze({
    ...rendering,
    blocks: Object.freeze(rendering.blocks.map(brandRendering)),
  })
}
function brandResult(block: Wire<ResultContentBlock>): ResultContentBlock {
  const branded = brandBlock(block)
  if (branded.kind === 'tool_call') throw new Error('validated result contains a call')
  return branded
}
function brandBlock(block: Wire<ContentBlock>): ContentBlock {
  const id: BlockId = identifier(block.id, 'BlockId')
  switch (block.kind) {
    case 'text':
      return Object.freeze({ ...block, id })
    case 'thinking': {
      const { opaque, ...rest } = block
      return Object.freeze({
        ...rest,
        id,
        ...(opaque === undefined ? {} : { opaque: toOpaqueJson(opaque) }),
      })
    }
    case 'voice':
    case 'image':
    case 'file':
      if (block.renderings !== undefined) {
        return Object.freeze({
          ...block,
          id,
          renderings: Object.freeze(block.renderings.map(brandDerivation)),
        })
      }
      return Object.freeze({ ...block, id })
    case 'tool_call':
      if (block.complete) {
        const callId: CallId = identifier(block.callId, 'CallId')
        return Object.freeze({ ...block, id, callId })
      }
      {
        const { callId, ...rest } = block
        return Object.freeze({
          ...rest,
          id,
          ...(callId === undefined ? {} : { callId: identifier(callId, 'CallId') }),
        })
      }
    case 'tool_result':
      return Object.freeze({
        ...block,
        id,
        callId: identifier(block.callId, 'CallId'),
        blocks: Object.freeze(block.blocks.map(brandResult)),
      })
  }
}
