import { describe, expect, test } from 'vitest'
import { judgeContentBlock } from '@omne-harness-lite/content-blocks'
import { reduceFills, type ReductionMode, type WholeFillBlock } from '../src/index.ts'
import { json, image } from './fixtures.ts'

function whole(text: string): WholeFillBlock {
  const result = judgeContentBlock(json(text))
  if (
    'rejected' in result ||
    (result.ok.kind !== 'image' && result.ok.kind !== 'file' && result.ok.kind !== 'tool_result')
  )
    throw new Error('invalid whole fixture')
  return result.ok
}
const file = whole(
  '{"kind":"file","id":"b_1","visibility":{"toHuman":true,"toModel":true},"attachment":{"storage":"s","key":"k","mediaType":"application/octet-stream","bytes":9007199254740993}}',
)
const result = whole(
  '{"kind":"tool_result","id":"b_1","visibility":{"toHuman":true,"toModel":true},"callId":"c","outcome":"completed","blocks":[{"kind":"thinking","id":"b_2","visibility":{"toHuman":true,"toModel":true},"text":"raw","opaque":{"nested":{"kind":"image","data":{"inline":"x"}}}}]}',
)
describe('S-19 unique pure reduction for every kind and legal fill mode', () => {
  for (const kind of [
    'text',
    'thinking',
    'tool_call',
    'voice',
    'image',
    'file',
    'tool_result',
  ] as const) {
    const mode: ReductionMode = { kind, fill: 'replace' }
    test(`${kind} no fills gives no reduction`, () => expect(reduceFills(mode, [])).toBeUndefined())
  }
  for (const kind of ['text', 'thinking', 'tool_call'] as const) {
    test(`${kind} append preserves Unicode, whitespace and invalid parameter syntax`, () => {
      expect(
        reduceFills({ kind, fill: 'append' }, [' ', '\u0000', '中', '\ud800', '{"a":1,"a":2}']),
      ).toBe(' \u0000中\ud800{"a":1,"a":2}')
      expect(reduceFills({ kind, fill: 'append' }, ['ab', 'cd'])).toBe(
        reduceFills({ kind, fill: 'append' }, ['abcd']),
      )
      expect(reduceFills({ kind, fill: 'append' }, [])).toBeUndefined()
    })
    test(`${kind} replace may clear the panel and never appends history`, () => {
      expect(reduceFills({ kind, fill: 'replace' }, ['first', 'last'])).toBe('last')
      expect(reduceFills({ kind, fill: 'replace' }, ['first', ''])).toBe('')
    })
    test(`${kind} empty append is a technical precondition failure`, () => {
      expect(() => reduceFills({ kind, fill: 'append' }, ['good', ''])).toThrow(TypeError)
    })
  }
  for (const value of [image(), file, result]) {
    test(`${value.kind} replaces with deep immutable isolated last whole block`, () => {
      const output = reduceFills({ kind: value.kind, fill: 'replace' }, [value])
      expect(output).toEqual(value)
      expect(output).not.toBe(value)
      expect(Object.isFrozen(output)).toBe(true)
      if (typeof output !== 'string' && output !== undefined)
        expect(Object.isFrozen(output.visibility)).toBe(true)
    })
  }
  test('whole replacements ignore removed superseded fills with identical result', () => {
    const first = image()
    const last = { ...first, data: { storage: 's', key: 'new', mediaType: 'image/png' } }
    expect(reduceFills({ kind: 'image', fill: 'replace' }, [first, last])).toEqual(
      reduceFills({ kind: 'image', fill: 'replace' }, [last]),
    )
    expect(first.data).toEqual({ storage: 's', key: 'k', mediaType: 'image/png' })
  })
  test('voice invalid alphabet/padding and empty replace are technical precondition failures', () => {
    for (const fill of ['', 'YR==', 'YQ==\n', 'YQ'])
      expect(() => reduceFills({ kind: 'voice', fill: 'replace' }, [fill])).toThrow(TypeError)
    expect(() => reduceFills({ kind: 'voice', fill: 'append' }, ['YQ==', 'bad!'])).toThrow(
      TypeError,
    )
  })
  test('all fills are required legal; malformed superseded whole fills are not repaired', () => {
    expect(() => reduceFills({ kind: 'image', fill: 'replace' }, [file, image()])).toThrow(
      TypeError,
    )
    expect(() => reduceFills({ kind: 'text', fill: 'replace' }, [image()])).toThrow(TypeError)
  })
})
