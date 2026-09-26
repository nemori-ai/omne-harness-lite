import { describe, expect, it } from 'vitest'
import {
  attachmentRefEquals,
  capabilityIdEquals,
  isCanonicalMediaType,
  judgeContentBlock,
  modalityOf,
  readOpaqueJson,
  writeJsonLossless,
} from '../src/index.ts'

const visibility = { toHuman: true, toModel: true }
const image = {
  id: 'image',
  kind: 'image',
  visibility,
  mediaType: 'image/png',
  data: { storage: 's', key: 'k', mediaType: 'image/png' },
}
describe('V-3: cross-member constraints and no repair', () => {
  it('rejects differing reference media types even when both have image modality', () => {
    const value = { ...image, data: { ...image.data, mediaType: 'image/jpeg' } }
    expect(judgeContentBlock(value)).toEqual({ rejected: 'malformed' })
    expect(value.data.mediaType).toBe('image/jpeg')
  })
  it('rejects same-modality derivations, including text files; no-modality files allow any output modality', () => {
    const childImage = { ...image, id: 'derived' }
    expect(
      judgeContentBlock({
        ...image,
        renderings: [{ producedBy: 'system', blocks: [childImage] }],
        transcript: 'image',
      }),
    ).toEqual({ rejected: 'malformed' })
    const text = { id: 't', kind: 'text', visibility, text: 'x' }
    const file = {
      id: 'f',
      kind: 'file',
      visibility,
      attachment: { storage: 's', key: 'k', mediaType: 'text/plain' },
      renderings: [{ producedBy: 'system', blocks: [text] }],
      transcript: 'x',
    }
    expect(judgeContentBlock(file)).toEqual({ rejected: 'malformed' })
    expect(
      'ok' in
        judgeContentBlock({
          ...file,
          attachment: { ...file.attachment, mediaType: 'application/pdf' },
        }),
    ).toBe(true)
  })
  it('preserves canonical media parameters, rejects noncanonical values unchanged', () => {
    expect(isCanonicalMediaType('text/plain;charset=UTF-8')).toBe(true)
    for (const mediaType of ['Image/PNG', 'image/png\n', 'image/png; name=x']) {
      const value = { ...image, mediaType, data: { ...image.data, mediaType } }
      expect(judgeContentBlock(value)).toEqual({ rejected: 'malformed' })
      expect(value.mediaType).toBe(mediaType)
    }
  })
  it('freezes its own accepted value deeply without freezing or changing caller objects', () => {
    const input = {
      id: 'b',
      kind: 'thinking',
      visibility: { ...visibility },
      text: '',
      opaque: { x: [1] },
    }
    const result = judgeContentBlock(input)
    if (!('ok' in result) || result.ok.kind !== 'thinking' || result.ok.opaque === undefined)
      throw new Error('expected block')
    expect(Object.isFrozen(input)).toBe(false)
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.ok)).toBe(true)
    expect(Object.isFrozen(result.ok.visibility)).toBe(true)
    expect(Object.isFrozen(readOpaqueJson(result.ok.opaque))).toBe(true)
    input.opaque.x.push(2)
    input.visibility.toHuman = false
    expect(writeJsonLossless(readOpaqueJson(result.ok.opaque))).toBe('{"x":[1]}')
    expect(result.ok.visibility.toHuman).toBe(true)
    expect(() => Reflect.set(result.ok.visibility, 'toHuman', false)).not.toThrow()
    expect(Reflect.set(result.ok.visibility, 'toHuman', false)).toBe(false)
  })
  it('does not parse either incomplete or unparseable rawArguments', () => {
    for (const rawArguments of ['{"x":1,"x":2}', 'not JSON', '{']) {
      expect(
        'ok' in
          judgeContentBlock({
            id: 'b',
            kind: 'tool_call',
            visibility: { toHuman: false, toModel: false },
            complete: false,
            rawArguments,
          }),
      ).toBe(true)
      expect(
        'ok' in
          judgeContentBlock({
            id: 'b',
            kind: 'tool_call',
            visibility,
            complete: true,
            callId: 'c',
            tool: 'read_file',
            rawArguments,
            unparseable: true,
          }),
      ).toBe(true)
    }
  })
  it('leaves message-level block identity uniqueness to messages', () => {
    expect(
      'ok' in
        judgeContentBlock({
          id: 'b',
          kind: 'tool_result',
          visibility,
          callId: 'c',
          outcome: 'completed',
          blocks: [{ id: 'b', kind: 'text', visibility, text: '' }],
        }),
    ).toBe(true)
  })
})

describe('S-6 / S-20 / S-21 pure public functions', () => {
  it('has four modalities and the separate no-modality result', () => {
    for (const type of ['text', 'image', 'audio', 'video'])
      expect(modalityOf(`${type}/x`)).toBe(type)
    expect(modalityOf('audio/pcm;rate=24000')).toBe('audio')
    expect(modalityOf('application/pdf')).toBeUndefined()
  })
  it('compares capability identity by both exact components', () => {
    expect(
      capabilityIdEquals({ category: 'tool', name: 'x' }, { category: 'tool', name: 'x' }),
    ).toBe(true)
    expect(
      capabilityIdEquals({ category: 'tool', name: 'x' }, { category: 'skill', name: 'x' }),
    ).toBe(false)
    expect(
      capabilityIdEquals({ category: 'tool', name: 'x' }, { category: 'tool', name: 'X' }),
    ).toBe(false)
    expect(
      capabilityIdEquals({ category: 'tool', name: 'é' }, { category: 'tool', name: 'é' }),
    ).toBe(false)
  })
  it('uses the three AttachmentRef equality examples from examples section 3', () => {
    const a = { storage: 'attachments', key: 'obj_5f2c', mediaType: 'image/png' }
    expect(attachmentRefEquals(a, { ...a, bytes: 20480, name: 'chart.png' })).toBe(true)
    expect(attachmentRefEquals(a, { ...a, key: 'OBJ_5F2C' })).toBe(false)
    expect(attachmentRefEquals(a, { ...a, storage: 'offload' })).toBe(false)
  })
})
