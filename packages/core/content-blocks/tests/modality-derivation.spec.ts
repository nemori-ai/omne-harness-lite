import { describe, expect, it } from 'vitest'
import { judgeContentBlock, writeJsonLossless } from '../src/index.ts'

const text = {
  id: 'derived-text',
  kind: 'text',
  visibility: { toHuman: false, toModel: true },
  text: 'recognized text',
}
const image = {
  id: 'derived-image',
  kind: 'image',
  visibility: { toHuman: true, toModel: false },
  mediaType: 'image/png',
  data: { inline: 'YQ==' },
}
const voice = {
  id: 'derived-voice',
  kind: 'voice',
  visibility: { toHuman: false, toModel: false },
  mediaType: 'audio/wav',
  data: { inline: 'YQ==' },
}
const originalImage = { ...image, id: 'original-image' }
const originalVoice = { ...voice, id: 'original-voice' }

function file(mediaType: string) {
  return {
    id: 'original-file',
    kind: 'file',
    visibility: { toHuman: false, toModel: true },
    attachment: { storage: 'attachments', key: 'file-key', mediaType },
  }
}

function rendering(blocks: readonly (typeof text | typeof image | typeof voice)[]) {
  return { producedBy: 'system', blocks }
}

function derived(
  original: typeof originalImage | typeof originalVoice | ReturnType<typeof file>,
  blocks: readonly (typeof text | typeof image | typeof voice)[],
) {
  return { ...original, renderings: [rendering(blocks)], transcript: 'original transcript' }
}

function result(block: ReturnType<typeof derived>) {
  return {
    id: 'result-block',
    kind: 'tool_result',
    visibility: { toHuman: true, toModel: true },
    callId: 'call-id',
    outcome: 'completed',
    blocks: [block],
  }
}

describe('public ContentBlock derivation judgment', () => {
  it.each([
    { title: 'voice with text', value: derived(originalVoice, [text]) },
    { title: 'voice with image', value: derived(originalVoice, [image]) },
    { title: 'image with voice', value: derived(originalImage, [voice]) },
    { title: 'image with text', value: derived(originalImage, [text]) },
    { title: 'audio file with image and text', value: derived(file('audio/wav'), [image, text]) },
    { title: 'image file with voice and text', value: derived(file('image/png'), [voice, text]) },
    {
      title: 'text file with voice and image',
      value: derived(file('text/plain;charset=UTF-8'), [voice, image]),
    },
    {
      title: 'video file with text, image and voice',
      value: derived(file('video/mp4'), [text, image, voice]),
    },
    {
      title: 'file without modality with text, image and voice',
      value: derived(file('application/pdf'), [text, image, voice]),
    },
    { title: 'nested result with voice and image', value: result(derived(originalVoice, [image])) },
    { title: 'voice without registered derivation', value: originalVoice },
    { title: 'image without registered derivation', value: originalImage },
  ])('accepts $title without changing its representation', ({ value }) => {
    const before = writeJsonLossless(value)
    const judgment = judgeContentBlock(value)
    expect(judgment).toStrictEqual({ ok: value })
    if (!('ok' in judgment)) throw new Error('expected accepted ContentBlock')
    expect(writeJsonLossless(judgment.ok)).toBe(before)
    expect(writeJsonLossless(value)).toBe(before)
    expect(judgment.ok).not.toBe(value)
    expect(Object.isFrozen(judgment)).toBe(true)
    expect(Object.isFrozen(judgment.ok)).toBe(true)
    expect(Object.isFrozen(judgment.ok.visibility)).toBe(true)
    expect(Object.isFrozen(value)).toBe(false)
  })

  it.each([
    { title: 'voice with voice', value: derived(originalVoice, [voice]) },
    { title: 'image with image', value: derived(originalImage, [image]) },
    { title: 'audio file with voice', value: derived(file('audio/wav'), [voice]) },
    { title: 'image file with image', value: derived(file('image/png'), [image]) },
    {
      title: 'text file with text despite canonical media parameters',
      value: derived(file('text/plain;charset=UTF-8'), [text]),
    },
    { title: 'voice with a matching second child', value: derived(originalVoice, [image, voice]) },
    { title: 'image with a matching second child', value: derived(originalImage, [voice, image]) },
    {
      title: 'voice with a matching second rendering',
      value: {
        ...derived(originalVoice, [text]),
        renderings: [rendering([text]), rendering([voice])],
      },
    },
    {
      title: 'image with a matching second rendering',
      value: {
        ...derived(originalImage, [text]),
        renderings: [rendering([text]), rendering([image])],
      },
    },
    { title: 'nested result with voice and voice', value: result(derived(originalVoice, [voice])) },
  ])('rejects $title as exactly malformed', ({ value }) => {
    const before = writeJsonLossless(value)
    expect(judgeContentBlock(value)).toStrictEqual({ rejected: 'malformed' })
    expect(writeJsonLossless(value)).toBe(before)
    expect(Object.isFrozen(value)).toBe(false)
  })

  it('owns and freezes every derivation while preserving caller order and media parameters', () => {
    const input = {
      ...file('application/pdf'),
      renderings: [
        rendering([
          { ...voice, visibility: { ...voice.visibility }, data: { inline: 'YQ==' } },
          { ...text, visibility: { ...text.visibility } },
        ]),
        rendering([{ ...image, visibility: { ...image.visibility }, data: { inline: 'YQ==' } }]),
      ],
      transcript: 'original transcript',
    }
    const expected = {
      id: 'original-file',
      kind: 'file',
      visibility: { toHuman: false, toModel: true },
      attachment: { storage: 'attachments', key: 'file-key', mediaType: 'application/pdf' },
      renderings: [
        {
          producedBy: 'system',
          blocks: [
            {
              id: 'derived-voice',
              kind: 'voice',
              visibility: { toHuman: false, toModel: false },
              mediaType: 'audio/wav',
              data: { inline: 'YQ==' },
            },
            {
              id: 'derived-text',
              kind: 'text',
              visibility: { toHuman: false, toModel: true },
              text: 'recognized text',
            },
          ],
        },
        {
          producedBy: 'system',
          blocks: [
            {
              id: 'derived-image',
              kind: 'image',
              visibility: { toHuman: true, toModel: false },
              mediaType: 'image/png',
              data: { inline: 'YQ==' },
            },
          ],
        },
      ],
      transcript: 'original transcript',
    }
    const judgment = judgeContentBlock(input)
    expect(judgment).toStrictEqual({ ok: expected })
    if (!('ok' in judgment) || judgment.ok.kind !== 'file' || judgment.ok.renderings === undefined)
      throw new Error('expected file with registered derivations')
    expect(judgment.ok.renderings).not.toBe(input.renderings)
    expect(Object.isFrozen(judgment.ok.renderings)).toBe(true)
    expect(Object.isFrozen(judgment.ok.attachment)).toBe(true)
    for (const group of judgment.ok.renderings) {
      expect(Object.isFrozen(group)).toBe(true)
      expect(Object.isFrozen(group.blocks)).toBe(true)
      for (const block of group.blocks) {
        expect(Object.isFrozen(block)).toBe(true)
        expect(Object.isFrozen(block.visibility)).toBe(true)
        if (block.kind !== 'text') expect(Object.isFrozen(block.data)).toBe(true)
      }
    }
    expect(input).toStrictEqual(expected)
    expect(Object.isFrozen(input.renderings)).toBe(false)
    input.renderings.reverse()
    input.attachment.mediaType = 'text/plain;charset=UTF-8'
    input.visibility.toHuman = true
    input.transcript = 'changed transcript'
    expect(judgment.ok).toStrictEqual(expected)
    expect(Reflect.set(judgment.ok.attachment, 'mediaType', 'image/png')).toBe(false)
  })
})
