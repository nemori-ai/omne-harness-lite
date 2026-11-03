import { describe, expect, it } from 'vitest'
import { toContentBlocks, type DeliveredContent } from '@omne-harness/mcp-contract'
import { json } from './json.ts'

const both = { toHuman: true, toModel: true }
const PNG = 'iVBORw0KGgo='

function delivered(items: readonly unknown[]): readonly DeliveredContent[] {
  return toContentBlocks(items.map(json))
}

describe('toContentBlocks', () => {
  it('turns text into a text block', () => {
    expect(delivered([{ type: 'text', text: 'hello' }])).toEqual([
      { kind: 'block', block: { kind: 'text', id: 'content-0', visibility: both, text: 'hello' } },
    ])
  })

  it('turns an image into an image block without changing its media type', () => {
    expect(delivered([{ type: 'image', data: PNG, mimeType: 'image/x-odd' }])).toEqual([
      {
        kind: 'block',
        block: {
          kind: 'image',
          id: 'content-0',
          visibility: both,
          mediaType: 'image/x-odd',
          inline: PNG,
        },
      },
    ])
  })

  it('turns audio into a voice block', () => {
    expect(delivered([{ type: 'audio', data: 'AAAA', mimeType: 'audio/wav' }])).toEqual([
      {
        kind: 'block',
        block: {
          kind: 'voice',
          id: 'content-0',
          visibility: both,
          mediaType: 'audio/wav',
          inline: 'AAAA',
        },
      },
    ])
  })

  it('hands over a resource link with its protocol type, as written', () => {
    const link = { type: 'resource_link', uri: 'file:///a.txt', name: 'a.txt', size: 12 }
    expect(delivered([link])).toEqual([
      { kind: 'protocol', type: 'resource_link', item: json(link) },
    ])
  })

  it('hands over an embedded text or binary resource with its protocol type, as written', () => {
    const text = { type: 'resource', resource: { uri: 'file:///a.txt', text: 'a' } }
    const blob = { type: 'resource', resource: { uri: 'file:///a.bin', blob: 'AAAA' } }
    expect(delivered([text, blob])).toEqual([
      { kind: 'protocol', type: 'resource', item: json(text) },
      { kind: 'protocol', type: 'resource', item: json(blob) },
    ])
  })

  it('keeps annotations apart as untrusted and keeps _meta', () => {
    const annotations = { audience: ['user'], priority: 0.5 }
    expect(
      delivered([
        { type: 'text', text: 'a', annotations, _meta: { k: 'v' } },
        { type: 'resource_link', uri: 'file:///a', name: 'a', annotations },
      ]),
    ).toEqual([
      {
        kind: 'block',
        block: { kind: 'text', id: 'content-0', visibility: both, text: 'a' },
        annotations: { untrusted: json(annotations) },
        meta: json({ k: 'v' }),
      },
      {
        kind: 'protocol',
        type: 'resource_link',
        item: json({ type: 'resource_link', uri: 'file:///a', name: 'a' }),
        annotations: { untrusted: json(annotations) },
      },
    ])
  })

  const invalid: readonly (readonly [string, unknown, string, string | undefined])[] = [
    ['an item that is not an object', 'text', 'not-an-object', undefined],
    ['an item without a type', { text: 'a' }, 'type-missing', undefined],
    ['an unknown type', { type: 'video', data: 'AAAA' }, 'type-unknown', 'video'],
    ['text that is not text', { type: 'text', text: 1 }, 'text-invalid', 'text'],
    [
      'image data that is not base64',
      { type: 'image', data: '*', mimeType: 'image/png' },
      'data-invalid',
      'image',
    ],
    ['audio without a media type', { type: 'audio', data: 'AAAA' }, 'mime-type-invalid', 'audio'],
    [
      'a resource link without a uri',
      { type: 'resource_link', name: 'a' },
      'uri-invalid',
      'resource_link',
    ],
    [
      'a resource link without a name',
      { type: 'resource_link', uri: 'file:///a' },
      'name-invalid',
      'resource_link',
    ],
    [
      'a resource with both text and blob',
      { type: 'resource', resource: { uri: 'file:///a', text: 'a', blob: 'AAAA' } },
      'resource-invalid',
      'resource',
    ],
    [
      'annotations that are not an object',
      { type: 'text', text: 'a', annotations: 1 },
      'annotations-invalid',
      'text',
    ],
  ]

  for (const [name, item, reason, type] of invalid)
    it(`turns ${name} into a text block that names the type and the reason`, () => {
      const [only] = delivered([item])
      expect(only).toMatchObject({
        kind: 'invalid',
        reason,
        ...(type === undefined ? {} : { type }),
      })
      if (only?.kind !== 'invalid') throw new Error('expected an invalid item')
      expect(only.block.kind).toBe('text')
      expect(only.block.text).toContain(reason)
      if (type !== undefined) expect(only.block.text).toContain(type)
    })

  it('keeps the peer order and drops no other item when one item is invalid', () => {
    const items = delivered([
      { type: 'text', text: 'first' },
      { type: 'image', data: 1, mimeType: 'image/png' },
      { type: 'text', text: 'third' },
    ])
    expect(items.map(item => item.kind)).toEqual(['block', 'invalid', 'block'])
    expect(items.map(item => (item.kind === 'protocol' ? item.type : item.block.id))).toEqual([
      'content-0',
      'content-1',
      'content-2',
    ])
  })

  it('does not copy the content of an invalid item into the explanation', () => {
    const [only] = delivered([
      { type: 'image', data: 'not base64 secret-ish', mimeType: 'image/png' },
    ])
    expect(only?.kind === 'invalid' && only.block.text.includes('secret-ish')).toBe(false)
  })
})
