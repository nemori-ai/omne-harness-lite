// Peer content to delivered content. Typed, in peer order, and nothing is dropped.
import {
  judgeContentBlock,
  type ContentBlock,
  type TextContentBlock,
} from '@omne-harness/content-block'
import type { JsonValue } from '@omne-harness/json-text'
import { isObject, member, textOf, without, type JsonObject } from './json.ts'
import type { ContentDefect, DeliveredContent } from './outcomes.ts'

const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u
const VISIBLE = { toHuman: true, toModel: true } as const

function isBase64(text: string | undefined): text is string {
  return text !== undefined && BASE64.test(text)
}

/** Builds a common block through its own judgment, so that no field is asserted. */
function block(candidate: Readonly<Record<string, unknown>>): ContentBlock {
  const judged = judgeContentBlock(candidate)
  if ('rejected' in judged) throw new TypeError(`content block rejected: ${judged.rejected}`)
  return judged.ok
}

function textBlock(id: string, text: string): TextContentBlock {
  const built = block({ kind: 'text', id, visibility: VISIBLE, text })
  if (built.kind !== 'text') throw new TypeError('a text block was not built as text')
  return built
}

type Reading = Readonly<{ block: ContentBlock }> | Readonly<{ defect: ContentDefect }>

function textReading(item: JsonObject, id: string): Reading {
  const text = textOf(member(item, 'text'))
  if (text === undefined) return { defect: 'text-invalid' }
  return { block: textBlock(id, text) }
}

function mediaReading(item: JsonObject, id: string, kind: 'image' | 'voice'): Reading {
  const data = textOf(member(item, 'data'))
  const mediaType = textOf(member(item, 'mimeType'))
  if (!isBase64(data)) return { defect: 'data-invalid' }
  if (mediaType === undefined || mediaType === '') return { defect: 'mime-type-invalid' }
  return { block: block({ kind, id, visibility: VISIBLE, mediaType, inline: data }) }
}

function linkDefect(item: JsonObject): ContentDefect | undefined {
  const uri = textOf(member(item, 'uri'))
  if (uri === undefined || uri === '') return 'uri-invalid'
  return textOf(member(item, 'name')) === undefined ? 'name-invalid' : undefined
}

function resourceDefect(item: JsonObject): ContentDefect | undefined {
  const resource = member(item, 'resource')
  if (!isObject(resource)) return 'resource-invalid'
  const uri = textOf(member(resource, 'uri'))
  const text = textOf(member(resource, 'text'))
  const blob = textOf(member(resource, 'blob'))
  if (uri === undefined || uri === '') return 'resource-invalid'
  if (text === undefined) return isBase64(blob) ? undefined : 'resource-invalid'
  return member(resource, 'blob') === undefined ? undefined : 'resource-invalid'
}

function invalid(index: number, reason: ContentDefect, type?: string): DeliveredContent {
  const named = type === undefined ? 'without a type' : `of type ${JSON.stringify(type)}`
  const text = `MCP content item ${index} ${named} was not delivered: ${reason}`
  const explanation = textBlock(`content-${index}`, text)
  return type === undefined
    ? { kind: 'invalid', reason, block: explanation }
    : { kind: 'invalid', type, reason, block: explanation }
}

type BlockReader = (item: JsonObject, id: string) => Reading

/** The content types that become common blocks. A type not here and not below is unknown. */
const BLOCK_READERS: Readonly<Record<string, BlockReader>> = {
  text: textReading,
  image: (item, id) => mediaReading(item, id, 'image'),
  audio: (item, id) => mediaReading(item, id, 'voice'),
}

/** The protocol content types that keep their type, with the check of each. */
const PROTOCOL_DEFECTS: Readonly<
  Record<'resource_link' | 'resource', (item: JsonObject) => ContentDefect | undefined>
> = {
  resource_link: linkDefect,
  resource: resourceDefect,
}

function isProtocolType(type: string): type is keyof typeof PROTOCOL_DEFECTS {
  return Object.hasOwn(PROTOCOL_DEFECTS, type)
}

function deliveredItem(item: JsonValue, index: number): DeliveredContent {
  if (!isObject(item)) return invalid(index, 'not-an-object')
  const type = textOf(member(item, 'type'))
  if (type === undefined) return invalid(index, 'type-missing')
  const annotations = member(item, 'annotations')
  if (annotations !== undefined && !isObject(annotations))
    return invalid(index, 'annotations-invalid', type)
  const untrusted = annotations === undefined ? {} : { annotations: { untrusted: annotations } }
  if (isProtocolType(type)) {
    const defect = PROTOCOL_DEFECTS[type](item)
    if (defect !== undefined) return invalid(index, defect, type)
    return { kind: 'protocol', type, item: without(item, 'annotations'), ...untrusted }
  }
  const reader = Object.hasOwn(BLOCK_READERS, type) ? BLOCK_READERS[type] : undefined
  if (reader === undefined) return invalid(index, 'type-unknown', type)
  const reading = reader(item, `content-${index}`)
  if ('defect' in reading) return invalid(index, reading.defect, type)
  const meta = member(item, '_meta')
  return {
    kind: 'block',
    block: reading.block,
    ...untrusted,
    ...(meta === undefined ? {} : { meta }),
  }
}

/**
 * Turns peer content items into delivered content, one for one and in peer order. Text becomes
 * a text block, an image an image block, audio a voice block. A resource link and an embedded
 * resource keep their protocol type. An invalid item becomes a text block that names its type
 * and the reason; its content is not copied. Block identifiers are `content-<index>`, unique
 * within one outcome. Both audiences see every block: who sees what is the caller's decision.
 */
export function toContentBlocks(items: readonly JsonValue[]): readonly DeliveredContent[] {
  return items.map(deliveredItem)
}
