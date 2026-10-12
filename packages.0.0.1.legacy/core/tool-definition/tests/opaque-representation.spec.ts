import { describe, expect, it } from 'vitest'
import {
  judgeContentBlock,
  readJsonStrict,
  readOpaqueJson,
  writeJsonLossless,
  type JsonValue,
  type ResultContentBlock,
} from '@omne-harness-lite/content-blocks'
import { isToolReturn, judgeToolReturn, toolResultOf } from '../src/index.ts'

const encoded = '{"token":"x","precision":9007199254740993,"nil":null}'
function payload(): JsonValue {
  const read = readJsonStrict(encoded)
  if ('failed' in read) throw new Error('fixture syntax')
  return read.ok
}
function thinking(id = 'thinking') {
  return {
    id,
    kind: 'thinking',
    text: '',
    opaque: payload(),
    visibility: { toHuman: false, toModel: false },
  }
}
const parsedId = judgeContentBlock(thinking('unused'))
if ('rejected' in parsedId) throw new Error('fixture id')
const id = parsedId.ok.id
function opaque(block: ResultContentBlock | undefined): string {
  if (block?.kind !== 'thinking' || block.opaque === undefined) throw new Error('missing thinking')
  return writeJsonLossless(readOpaqueJson(block.opaque))
}

describe('TD-OPAQUE representation to domain boundary', () => {
  it('TD-OPAQUE-WIRE: wire content becomes genuine opaque domain value', () => {
    const wire = { content: [thinking()] }
    expect(judgeToolReturn(wire)).toEqual({ ok: true })
    expect(isToolReturn(wire)).toBe(true)
    const result = toolResultOf(wire, id)
    expect(opaque(result.content[0])).toBe(encoded)
    expect(readJsonStrict(writeJsonLossless(result))).toEqual(
      readJsonStrict(writeJsonLossless(wire)),
    )
  })
  it('TD-OPAQUE-DOMAIN: already branded content is retained through owned copying', () => {
    const judged = judgeContentBlock(thinking())
    if ('rejected' in judged || judged.ok.kind !== 'thinking') throw new Error('fixture block')
    const result = toolResultOf({ content: [judged.ok] }, id)
    expect(opaque(result.content[0])).toBe(encoded)
    expect(result.content[0]).not.toBe(judged.ok)
  })
  it('TD-OPAQUE-NESTED: every nested result and offload summary rebuilds its opaque brand', () => {
    const nested = {
      id: 'result',
      kind: 'tool_result',
      callId: 'call',
      outcome: 'completed',
      blocks: [thinking('nested')],
      visibility: { toHuman: true, toModel: true },
    }
    const result = toolResultOf(
      {
        content: [nested],
        offload: {
          raw: { inline: 'eA==', mediaType: 'text/plain' },
          summary: [nested, thinking()],
        },
      },
      id,
    )
    const content = result.content[0]
    const summary = result.offload?.summary?.[0]
    if (content?.kind !== 'tool_result' || summary?.kind !== 'tool_result')
      throw new Error('missing nested result')
    expect(opaque(content.blocks[0])).toBe(encoded)
    expect(opaque(summary.blocks[0])).toBe(encoded)
    expect(opaque(result.offload?.summary?.[1])).toBe(encoded)
  })
  it('TD-OPAQUE-OWNERSHIP: constructor freezes only its copied domain containers', () => {
    const block = thinking()
    const wire = { content: [block] }
    const result = toolResultOf(wire, id)
    expect(Object.isFrozen(wire)).toBe(false)
    expect(Object.isFrozen(wire.content)).toBe(false)
    expect(Object.isFrozen(block)).toBe(false)
    expect(Object.isFrozen(block.visibility)).toBe(false)
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.content)).toBe(true)
    expect(Object.isFrozen(result.content[0])).toBe(true)
    block.text = 'changed'
    expect(result.content[0]).toHaveProperty('text', '')
  })
  it('TD-OPAQUE-PRESENCE: absent stays absent, explicit null is wrapped', () => {
    const { opaque: omitted, ...base } = thinking()
    expect(omitted).toBeDefined()
    const result = toolResultOf({ content: [base, { ...base, opaque: null }] }, id)
    expect(Object.hasOwn(result.content[0] ?? {}, 'opaque')).toBe(false)
    expect(opaque(result.content[1])).toBe('null')
    expect(Object.hasOwn(result, 'offload')).toBe(false)
    expect(Object.hasOwn(result, 'attachments')).toBe(false)
  })
  it('TD-OPAQUE-FAILURE: existing block refusal wins over return shape, conversion stays loud', () => {
    const wire = { content: [{ ...thinking(), visibility: undefined }], unexpected: true }
    expect(judgeToolReturn(wire)).toEqual({ rejected: 'malformed', malformed: 'M16' })
    expect(() => toolResultOf(wire, id)).toThrow(TypeError)
    expect(
      judgeToolReturn({ content: [{ ...thinking(), kind: 'unknown' }], unexpected: true }),
    ).toEqual({ rejected: 'kind_unknown' })
  })
})
