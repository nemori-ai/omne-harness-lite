import { describe, expect, it } from 'vitest'
import {
  contentBlockFromRepresentation,
  judgeContentBlock,
  readJsonStrict,
  readOpaqueJson,
  validate,
  writeJsonLossless,
} from '../src/index.ts'

const visibility = { toHuman: false, toModel: false }
describe('CB-REP shape-only domain restoration', () => {
  it('CB-REP-OPAQUE: exact raw JSON becomes an opaque wrapper, including explicit null', () => {
    for (const encoded of ['null', '{"n":9007199254740993,"decimal":1.2300,"e":1e400}']) {
      const read = readJsonStrict(encoded)
      if ('failed' in read) throw new Error('fixture')
      const wire = { id: 'b', kind: 'thinking', text: '', opaque: read.ok, visibility }
      const block = contentBlockFromRepresentation(wire)
      if (block.kind !== 'thinking' || block.opaque === undefined) throw new Error('missing opaque')
      expect(writeJsonLossless(readOpaqueJson(block.opaque))).toBe(encoded)
      expect(readJsonStrict(writeJsonLossless(block))).toEqual(
        readJsonStrict(writeJsonLossless(wire)),
      )
    }
  })
  it('CB-REP-NESTED: result recursion restores only normative opaque locations', () => {
    const wire = {
      id: 'result',
      kind: 'tool_result',
      callId: 'call',
      outcome: 'completed',
      visibility,
      blocks: [
        {
          id: 'nested',
          kind: 'thinking',
          text: '',
          opaque: { opaque: 'ordinary-key' },
          visibility,
        },
      ],
    }
    const block = contentBlockFromRepresentation(wire)
    if (block.kind !== 'tool_result') throw new Error('missing result')
    const nested = block.blocks[0]
    if (nested?.kind !== 'thinking' || nested.opaque === undefined)
      throw new Error('missing thinking')
    expect(readOpaqueJson(nested.opaque)).toEqual({ opaque: 'ordinary-key' })
  })
  it('CB-REP-SHAPE: Schema-only restoration does not claim complete cross-member judgment', () => {
    const wire = {
      id: 'b',
      kind: 'voice',
      mediaType: 'audio/wav',
      data: { storage: 's', key: 'k', mediaType: 'audio/ogg' },
      visibility,
    }
    expect(validate('ContentBlock', wire)).toEqual({ valid: true })
    expect(judgeContentBlock(wire)).toEqual({ rejected: 'malformed' })
    expect(writeJsonLossless(contentBlockFromRepresentation(wire))).toBe(writeJsonLossless(wire))
  })
  it('CB-REP-OWNER: copies, freezes and rejects invalid preconditions without invoking getters', () => {
    const wire = { id: 'b', kind: 'thinking', text: '', visibility: { ...visibility } }
    const block = contentBlockFromRepresentation(wire)
    expect(Object.isFrozen(wire)).toBe(false)
    expect(Object.isFrozen(wire.visibility)).toBe(false)
    expect(Object.isFrozen(block)).toBe(true)
    expect(Object.isFrozen(block.visibility)).toBe(true)
    expect(Object.hasOwn(block, 'opaque')).toBe(false)
    const rawOpaque = { nested: { token: 'original' } }
    const thinking = contentBlockFromRepresentation({ ...wire, opaque: rawOpaque })
    if (thinking.kind !== 'thinking' || thinking.opaque === undefined)
      throw new Error('missing opaque')
    expect(Object.isFrozen(rawOpaque)).toBe(false)
    expect(Object.isFrozen(rawOpaque.nested)).toBe(false)
    rawOpaque.nested.token = 'changed'
    expect(readOpaqueJson(thinking.opaque)).toEqual({ nested: { token: 'original' } })
    expect(Object.isFrozen(readOpaqueJson(thinking.opaque))).toBe(true)
    let reads = 0
    const accessor = {
      get kind() {
        reads += 1
        return 'thinking'
      },
    }
    expect(() => contentBlockFromRepresentation(accessor)).toThrow(TypeError)
    expect(reads).toBe(0)
    expect(() => contentBlockFromRepresentation({ ...wire, opaque: undefined })).toThrow(TypeError)
  })
})
