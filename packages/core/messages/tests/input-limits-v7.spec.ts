import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  readJsonStrict,
  writeJsonLossless,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { brandRecord, judgeModelInvocationRecord, validate } from '@omne-harness-lite/messages'

const examples = JSON.parse(
  readFileSync(
    new URL(
      '../../../../.meta_harness/design/spec/data/messages/v7/input-limit-examples.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as {
  readonly contract: string
  readonly cases: readonly {
    readonly name: string
    readonly schemaValid: boolean
    readonly value: JsonValue
  }[]
}

describe('MS7 current complete snapshot reception', () => {
  it('consumes all 12 current contract examples', () => {
    expect(examples.contract).toBe('data.messages/v7')
    expect(examples.cases).toHaveLength(12)
  })

  it.each(examples.cases)('$name: shape and full single-record judgment', test => {
    const before = writeJsonLossless(test.value)
    expect(validate('ModelCallDispatchedRecord', test.value).valid).toBe(test.schemaValid)
    const result = judgeModelInvocationRecord(test.value)
    expect('ok' in result).toBe(test.schemaValid)
    expect(writeJsonLossless(test.value)).toBe(before)
  })

  it('copies both complete limit objects and keeps the original numbers', () => {
    const source = examples.cases.find(test => test.name === 'all_caps_equal_upstream')?.value
    if (source === undefined) throw new Error('missing current fixture')
    const read = readJsonStrict(writeJsonLossless(source))
    if ('failed' in read) throw new Error(read.failed)
    const before = writeJsonLossless(read.ok)
    const branded = brandRecord(read.ok)
    if (branded.kind !== 'model_call_dispatched') throw new Error('not a dispatched record')
    expect(writeJsonLossless(branded.profileSnapshot.inputConstraints)).toContain('maxImageBytes')
    expect(writeJsonLossless(branded.profileSnapshot.upstreamInputLimits)).toContain(
      'maxRequestBytes',
    )
    expect(writeJsonLossless(read.ok)).toBe(before)
  })

  it('retains adjacent unsafe integers in project caps and upstream facts', () => {
    const source = examples.cases.find(test => test.name === 'all_caps_equal_upstream')?.value
    if (source === undefined) throw new Error('missing current fixture')
    const text = writeJsonLossless(source)
      .replace('"maxRequestBytes":1000', '"maxRequestBytes":9007199254740992')
      .replace(
        '"maxRequestBytes":{"status":"limited","value":1000}',
        '"maxRequestBytes":{"status":"limited","value":9007199254740993}',
      )
    const read = readJsonStrict(text)
    if ('failed' in read) throw new Error(read.failed)
    const judged = judgeModelInvocationRecord(read.ok)
    if ('rejected' in judged || judged.ok.kind !== 'model_call_dispatched')
      throw new Error('current record rejected')
    const restored = writeJsonLossless(judged.ok)
    expect(restored).toContain('"maxRequestBytes":9007199254740992')
    expect(restored).toContain('"value":9007199254740993')
    expect(restored).toBe(text)
  })
})
