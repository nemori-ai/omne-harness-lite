import { randomUUID } from 'node:crypto'
import {
  contentBlockFromRepresentation,
  isJsonNumber,
  jsonNumberSource,
  type AttachmentRef,
  type JsonValue,
  type JsonObject,
} from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import type { ToolExecutor } from '@omne-harness-lite/tool-execution-runtime'
import type { ToolDefinition, ToolReturn } from '@omne-harness-lite/tool-definition'

export const RESULT_CONTEXT_KEY = 'tool-results.scope'
export const sessionResultDefinition: ToolDefinition = {
  name: 'Result',
  description:
    'Read an attachment from a completed tool result in this session. Supply its complete attachment reference. Text is returned as UTF-8; images remain image attachments; other bytes are returned as base64. Maximum 512 KiB.',
  paradigm: 'single',
  origin: { kind: 'authored' },
  permissions: { execute: { default: 'auto' } },
  input: {
    type: 'object',
    description: 'An attachment reference from a completed tool result.',
    properties: {
      storage: { type: 'string', description: 'Original storage identifier.' },
      key: { type: 'string', description: 'Original attachment key.' },
      mediaType: { type: 'string', description: 'Original media type.' },
      bytes: { type: 'integer', minimum: 0, maximum: 524288, description: 'Original byte length.' },
      name: { type: 'string', description: 'Original name, if present.' },
    },
    required: ['storage', 'key', 'mediaType', 'bytes'],
    additionalProperties: false,
  },
}
export const sessionResultAsset: {
  readonly id: string
  readonly capability: { readonly category: 'tool'; readonly name: string }
  readonly origin: 'official'
  readonly versions: readonly {
    readonly number: number
    readonly publishedAt: string
    readonly content: { readonly category: 'tool'; readonly definition: ToolDefinition }
  }[]
} = {
  id: 'omne.cli.result',
  capability: { category: 'tool' as const, name: 'Result' },
  origin: 'official' as const,
  versions: [
    {
      number: 1,
      publishedAt: '2026-10-10T14:00:00Z',
      content: { category: 'tool' as const, definition: sessionResultDefinition },
    },
  ],
}

function isObject(value: JsonValue): value is JsonObject {
  return (
    value !== null && typeof value === 'object' && !Array.isArray(value) && !isJsonNumber(value)
  )
}

function attachment(args: JsonValue) {
  if (!isObject(args)) throw new TypeError('Validated Result arguments required')
  const { storage, key, mediaType, bytes, name } = args
  if (
    typeof storage !== 'string' ||
    typeof key !== 'string' ||
    typeof mediaType !== 'string' ||
    !isJsonNumber(bytes)
  )
    throw new TypeError('Validated attachment reference required')
  const length = Number(jsonNumberSource(bytes))
  if (!Number.isSafeInteger(length) || length < 0 || length > 524288) return undefined
  const reference: AttachmentRef = {
    storage,
    key,
    mediaType,
    bytes,
    ...(typeof name === 'string' ? { name } : {}),
  }
  return { reference, length }
}
function content(data: Uint8Array, mediaType: string): ToolReturn {
  if (!mediaType.startsWith('image/'))
    return mediaType.startsWith('text/') || mediaType === 'application/json'
      ? new TextDecoder('utf-8', { fatal: true }).decode(data)
      : 'base64: ' + Buffer.from(data).toString('base64')
  const id = parseOpaqueIdentifier(randomUUID(), 'BlockId')
  if (!('ok' in id)) throw new Error('Invalid image block identifier')
  const block = contentBlockFromRepresentation({
    id: id.ok,
    kind: 'image',
    mediaType,
    data: { inline: Buffer.from(data).toString('base64') },
    visibility: { toHuman: true, toModel: true },
  })
  if (block.kind !== 'image') throw new Error('Expected image block')
  return { content: [block] }
}
export function createSessionResultReader(
  read: (session: string, reference: AttachmentRef) => Promise<Uint8Array | undefined>,
): ToolExecutor {
  return async (args, deps) => {
    const value = attachment(args)
    if (!value) return 'Attachment exceeds the 512 KiB limit.'
    const context = await deps.context.read([RESULT_CONTEXT_KEY])
    if (context.kind !== 'values' || context.values.length !== 1)
      return 'Attachment context unavailable.'
    const session = context.values[0]?.value
    if (typeof session !== 'string') return 'Attachment context unavailable.'
    const data = await read(session, value.reference)
    if (!data || data.byteLength !== value.length) return 'Attachment unavailable.'
    return content(data, value.reference.mediaType)
  }
}
