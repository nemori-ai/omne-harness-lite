import { describe, expect, it } from 'vitest'
import {
  jsonNumberSource,
  readJsonStrict,
  writeJsonLossless,
} from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import { judgeToolReturn, toolResultOf, validate } from '@omne-harness-lite/tool-definition'

function json(source: string) {
  const parsed = readJsonStrict(source)
  if ('failed' in parsed) throw new Error(`invalid JSON fixture: ${source}`)
  return parsed.ok
}

const parsedId = parseOpaqueIdentifier('return-reference', 'BlockId')
if (!('ok' in parsedId)) throw new Error('invalid block identity fixture')
const blockId = parsedId.ok

describe('exact offload references through the public tool return boundary', () => {
  it.each([
    { bytes: undefined, business: {}, businessText: '' },
    { bytes: '0', business: { isError: false }, businessText: ',"isError":false' },
    { bytes: '9007199254740993', business: { isError: true }, businessText: ',"isError":true' },
    { bytes: '1e400', business: {}, businessText: '' },
    { bytes: '1.0', business: { isError: false }, businessText: ',"isError":false' },
    { bytes: '1e0', business: { isError: true }, businessText: ',"isError":true' },
  ])('preserves bytes $bytes and business state $business', ({ bytes, business, businessText }) => {
    const raw = {
      storage: 's',
      key: 'k',
      mediaType: 'application/json',
      ...(bytes === undefined ? {} : { bytes: json(bytes) }),
    }
    const content = {
      id: 'content',
      kind: 'text',
      visibility: { toHuman: true, toModel: true },
      text: 'visible result',
    }
    const summary = {
      id: 'summary',
      kind: 'text',
      visibility: { toHuman: false, toModel: true },
      text: 'stored result',
    }
    const attachment = { ...raw }
    const returned = {
      content: [content],
      ...business,
      offload: { raw, summary: [summary] },
      attachments: [attachment],
    }
    const bytesText = bytes === undefined ? '' : `,"bytes":${bytes}`
    const expectedText =
      '{"content":[{"id":"content","kind":"text","visibility":{"toHuman":true,"toModel":true},"text":"visible result"}]' +
      businessText +
      `,"offload":{"raw":{"storage":"s","key":"k","mediaType":"application/json"${bytesText}},` +
      '"summary":[{"id":"summary","kind":"text","visibility":{"toHuman":false,"toModel":true},"text":"stored result"}]},' +
      `"attachments":[{"storage":"s","key":"k","mediaType":"application/json"${bytesText}}]}`
    const expected = json(expectedText)

    expect(validate('Offload', returned.offload)).toEqual({ valid: true })
    expect(validate('ToolReturn', returned)).toEqual({ valid: true })
    expect(validate('ToolResult', returned)).toEqual({ valid: true })
    expect(judgeToolReturn(returned)).toEqual({ ok: true })
    const result = toolResultOf(returned, blockId)
    expect(result).toEqual(expected)
    expect(writeJsonLossless(result)).toBe(expectedText)
    expect(writeJsonLossless(returned)).toBe(expectedText)
    expect(Object.hasOwn(result, 'isError')).toBe(Object.hasOwn(business, 'isError'))

    const resultRaw = result.offload?.raw
    if (resultRaw === undefined || !('storage' in resultRaw))
      throw new Error('missing result attachment reference')
    expect(Object.hasOwn(resultRaw, 'bytes')).toBe(bytes !== undefined)
    if (bytes !== undefined) {
      if (resultRaw.bytes === undefined) throw new Error('missing exact byte count')
      expect(jsonNumberSource(resultRaw.bytes)).toBe(bytes)
    }
    expect(result).not.toBe(returned)
    expect(result.content).not.toBe(returned.content)
    expect(result.content[0]).not.toBe(content)
    expect(result.content[0]?.visibility).not.toBe(content.visibility)
    expect(result.offload).not.toBe(returned.offload)
    expect(resultRaw).not.toBe(raw)
    expect(result.offload?.summary).not.toBe(returned.offload.summary)
    expect(result.offload?.summary?.[0]).not.toBe(summary)
    expect(result.attachments).not.toBe(returned.attachments)
    expect(result.attachments?.[0]).not.toBe(attachment)
    for (const layer of [
      result,
      result.content,
      result.content[0],
      result.content[0]?.visibility,
      result.offload,
      resultRaw,
      result.offload?.summary,
      result.offload?.summary?.[0],
      result.attachments,
      result.attachments?.[0],
    ]) {
      expect(layer).toBeDefined()
      expect(Object.isFrozen(layer)).toBe(true)
    }
    for (const layer of [returned, returned.content, content, returned.offload, raw, attachment])
      expect(Object.isFrozen(layer)).toBe(false)
    content.text = 'changed content'
    content.visibility.toModel = false
    returned.content.length = 0
    summary.text = 'changed summary'
    returned.offload.summary.length = 0
    raw.key = 'changed raw'
    attachment.key = 'changed attachment'
    returned.attachments.length = 0
    expect(result).toEqual(expected)
    expect(writeJsonLossless(result)).toBe(expectedText)
  })

  it.each(['0.1', '-1', '1e-400', '1.00000000000000000000000001'])(
    'rejects bytes %s in raw as M21 and in attachments as M23',
    bytes => {
      const reference = json(
        `{"storage":"s","key":"k","mediaType":"application/json","bytes":${bytes}}`,
      )
      const returned = { content: [], offload: { raw: reference } }
      const before = writeJsonLossless(returned)
      expect(validate('ToolReturn', returned)).toEqual({ valid: false })
      expect(validate('ToolResult', returned)).toEqual({ valid: false })
      expect(judgeToolReturn(returned)).toEqual({ rejected: 'malformed', malformed: 'M21' })
      expect(() => toolResultOf(returned, blockId)).toThrow(TypeError)
      expect(validate('Offload', returned.offload)).toEqual({ valid: false })
      expect(writeJsonLossless(returned)).toBe(before)

      const attached = {
        content: [],
        offload: { raw: { storage: 's', key: 'k', mediaType: 'application/json' } },
        attachments: [reference],
      }
      const attachedBefore = writeJsonLossless(attached)
      expect(validate('Offload', attached.offload)).toEqual({ valid: true })
      expect(validate('ToolReturn', attached)).toEqual({ valid: false })
      expect(validate('ToolResult', attached)).toEqual({ valid: false })
      expect(judgeToolReturn(attached)).toEqual({ rejected: 'malformed', malformed: 'M23' })
      expect(() => toolResultOf(attached, blockId)).toThrow(TypeError)
      expect(writeJsonLossless(attached)).toBe(attachedBefore)
    },
  )

  it('keeps inline raw independent without adding summary, attachments or business state', () => {
    const returned = {
      content: [],
      offload: { raw: { inline: 'eA==', mediaType: 'text/plain' } },
    }
    const expected = {
      content: [],
      offload: { raw: { inline: 'eA==', mediaType: 'text/plain' } },
    }
    expect(validate('Offload', returned.offload)).toEqual({ valid: true })
    expect(validate('ToolReturn', returned)).toEqual({ valid: true })
    expect(validate('ToolResult', returned)).toEqual({ valid: true })
    expect(judgeToolReturn(returned)).toEqual({ ok: true })
    const result = toolResultOf(returned, blockId)
    expect(result).toEqual(expected)
    expect(returned).toEqual(expected)
    expect(result.offload?.raw).not.toBe(returned.offload.raw)
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.offload)).toBe(true)
    expect(Object.hasOwn(result.offload ?? {}, 'summary')).toBe(false)
    expect(Object.hasOwn(result, 'attachments')).toBe(false)
    expect(Object.hasOwn(result, 'isError')).toBe(false)
    returned.offload.raw.inline = 'eQ=='
    expect(result).toEqual(expected)
  })

  it('accepts a JSON-looking string only as ToolReturn and normalizes it as ordinary text', () => {
    const returned = '{"isError":true,"content":[]}'
    expect(validate('ToolReturn', returned)).toEqual({ valid: true })
    expect(validate('ToolResult', returned)).toEqual({ valid: false })
    expect(judgeToolReturn(returned)).toEqual({ ok: true })
    const result = toolResultOf(returned, blockId)
    expect(result).toEqual({
      content: [
        {
          id: 'return-reference',
          kind: 'text',
          visibility: { toHuman: true, toModel: true },
          text: '{"isError":true,"content":[]}',
        },
      ],
    })
    expect(validate('ToolResult', result)).toEqual({ valid: true })
    expect(Object.hasOwn(result, 'isError')).toBe(false)
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.content)).toBe(true)
    expect(Object.isFrozen(result.content[0])).toBe(true)
    expect(Object.isFrozen(result.content[0]?.visibility)).toBe(true)
  })
})
