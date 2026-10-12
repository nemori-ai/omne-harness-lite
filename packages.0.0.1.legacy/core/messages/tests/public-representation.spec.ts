import { describe, expect, it } from 'vitest'
import {
  readJsonStrict,
  readOpaqueJson,
  writeJsonLossless,
} from '@omne-harness-lite/content-blocks'
import {
  brandMessage,
  brandRecord,
  isWireMessage,
  isWireRecord,
  judgeMessage,
  judgeModelInvocationRecord,
  validate,
} from '@omne-harness-lite/messages'

const at = '2026-09-23T10:00:00Z'
const visibility = { toHuman: false, toModel: false }
const encoded = '{"token":"x","number":9007199254740993,"nil":null}'
function thinking() {
  const read = readJsonStrict(encoded)
  if ('failed' in read) throw new Error('fixture')
  return { id: 'b', kind: 'thinking', text: '', opaque: read.ok, visibility }
}
function assistant() {
  return {
    id: 'msg',
    type: 'assistant',
    response: 'rsp',
    ending: 'complete',
    createdAt: at,
    blocks: [thinking()],
  }
}
describe('MSG-REP public transport restoration', () => {
  it('MSG-REP-OPAQUE: raw and branded messages restore exact opaque values', () => {
    for (const input of [assistant(), brandMessage(assistant())]) {
      const restored = brandMessage(input)
      if (restored.type !== 'assistant') throw new Error('fixture type')
      const block = restored.blocks[0]
      if (block?.kind !== 'thinking' || block.opaque === undefined)
        throw new Error('fixture opaque')
      expect(writeJsonLossless(readOpaqueJson(block.opaque))).toBe(encoded)
    }
  })
  it('MSG-REP-NESTED: tool result messages restore nested thinking payloads', () => {
    const result = brandMessage({
      id: 'msg',
      type: 'tool',
      callId: 'call',
      createdAt: at,
      blocks: [
        {
          id: 'r',
          kind: 'tool_result',
          callId: 'call',
          outcome: 'completed',
          visibility,
          blocks: [thinking()],
        },
      ],
    })
    if (result.type !== 'tool') throw new Error('fixture type')
    const block = result.blocks[0].blocks[0]
    if (block?.kind !== 'thinking' || block.opaque === undefined) throw new Error('fixture opaque')
    expect(writeJsonLossless(readOpaqueJson(block.opaque))).toBe(encoded)
  })
  it('MSG-REP-SEPARATE: duplicate ids remain Schema admitted but full receiver rejects', () => {
    const wire = { ...assistant(), blocks: [thinking(), thinking()] }
    expect(validate('Message', wire)).toEqual({ valid: true })
    expect(judgeMessage(wire)).toEqual({ rejected: 'block_id_duplicate' })
    expect(brandMessage(wire).blocks).toHaveLength(2)
  })
  it('MSG-REP-MEDIA: shape-only adapter keeps the prior embedded-value meaning', () => {
    const wire = {
      ...assistant(),
      blocks: [
        {
          id: 'b',
          kind: 'voice',
          mediaType: 'audio/wav',
          data: { storage: 's', key: 'k', mediaType: 'audio/ogg' },
          visibility,
        },
      ],
    }
    expect(validate('Message', wire)).toEqual({ valid: true })
    expect(judgeMessage(wire)).toEqual({ rejected: 'malformed' })
    expect(writeJsonLossless(brandMessage(wire))).toBe(writeJsonLossless(wire))
  })
  it('MSG-REP-RECORD: dispatch Shape is restored without adding record business checks', () => {
    const wire = {
      adaptation: {
        implementation: { name: 'test', revision: '1' },
        definition: { modelId: 'r', revision: '1' },
        configuration: { revision: '1', values: {} },
      },
      kind: 'model_call_dispatched',
      call: 'call',
      dispatch: 1,
      provider: 'p',
      response: 'rsp',
      profile: { origin: 'official', routeName: 'r' },
      profileSnapshot: {
        providers: ['p'],
        allowFallback: true,
        inputModalities: ['text'],
        outputModalities: ['text'],
        maxInputTokens: 100,
        maxOutputTokens: 10,
        inputConstraints: {},
        upstreamInputLimits: {
          maxInputTokens: { status: 'unknown' },
          maxRequestBytes: { status: 'unknown' },
        },
        adaptation: {
          implementation: { name: 'test', revision: '1' },
          definition: { modelId: 'r', revision: '1' },
          configuration: { revision: '1', values: {} },
        },
        updatedAt: at,
      },
      parameters: {},
      selectedBy: 'session',
      credentialScope: { layer: 'factory' },
      droppedParameters: ['notExtra'],
    }
    expect(validate('ModelCallDispatchedRecord', wire)).toEqual({ valid: true })
    expect(judgeModelInvocationRecord(wire)).toEqual({ rejected: 'malformed' })
    expect(writeJsonLossless(brandRecord(wire))).toBe(writeJsonLossless(wire))
  })
  it('MSG-REP-PRECONDITION: invalid representations fail loudly, valid JSON wire guards remain shape only', () => {
    expect(() => brandMessage({})).toThrow(TypeError)
    expect(() => brandRecord({})).toThrow(TypeError)
    expect(isWireMessage({})).toBe(false)
    expect(isWireRecord({})).toBe(false)
    const wire = assistant()
    const result = brandMessage(wire)
    expect(Object.isFrozen(wire)).toBe(false)
    expect(Object.isFrozen(wire.blocks)).toBe(false)
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.blocks)).toBe(true)
    expect(Object.isFrozen(result.blocks[0])).toBe(true)
  })
})
