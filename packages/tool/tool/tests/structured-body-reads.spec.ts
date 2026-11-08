import { afterEach, expect, it } from 'vitest'
import { jsonDocumentFixture } from './structured-body-values.ts'
import { sourceFixture, registeredFixture, token, options } from './tools-values.ts'
import { ok } from './runtime-values.ts'
import { auditQueues } from './start-values.ts'

afterEach(auditQueues)

it.each([9, 4096])(
  'reads JSON documents through Tools with completeness and fixed schema at page size %i',
  async maxBytes => {
    const text = '{ "amount":1.00, "label":"中文🙂", "rows":[1,2] }'
    const document = jsonDocumentFixture(text)
    const f = await sourceFixture(document.value, { contentPageBytes: maxBytes }, [], document)
    const reference = token(await f.tools.present(f.access), 'bodyReference')
    const registered = registeredFixture(f.tools)
    let after: string | null = null
    let actual = ''
    let pages = 0
    for (; pages < 32; pages++) {
      const result = ok(
        (await registered.invoke('read_result', { kind: 'body', reference, after })).full,
      )
      const page = result.content.find(block => block.id === 'Tools.body')
      if (page?.kind !== 'text')
        throw new Error(`JSON text page missing: ${JSON.stringify(result)}`)
      expect(token(result, 'format')).toBe('json-document')
      expect(token(result, 'completeness')).toBe(maxBytes === 4096 ? 'complete' : 'fragment')
      expect(JSON.parse(token(result, 'schema'))).toEqual(document.schema)
      actual += page.text
      const next = token(result, 'next')
      if (next === 'null') break
      expect(next).not.toBe(after)
      after = next
    }
    expect(actual).toBe(text)
    expect(pages < 32).toBe(true)
  },
)

it('shrinks JSON document pages to the serialized reply budget without losing source text', async () => {
  const text = JSON.stringify({ report: '中文🙂"\\\n'.repeat(600) })
  const document = jsonDocumentFixture(text)
  const limits = { ...options, contentPageBytes: 4096, resultPageBytes: 4096, replyMaxBytes: 4096 }
  const f = await sourceFixture(document.value, limits, [], document)
  const reference = token(await f.tools.present(f.access), 'bodyReference')
  let after: string | null = null
  let actual = ''
  let ended = false
  for (let pageNumber = 0; pageNumber < 64; pageNumber++) {
    const result = await f.tools.read({
      ...f.access,
      arguments: { kind: 'body', reference, after },
    })
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(limits.replyMaxBytes)
    expect(token(result, 'completeness')).toBe('fragment')
    const page = result.content.find(block => block.id === 'Tools.body')
    if (page?.kind !== 'text') throw new Error('JSON text page missing')
    actual += page.text
    const next = token(result, 'next')
    if (next === 'null') {
      ended = true
      break
    }
    expect(next).not.toBe(after)
    after = next
  }
  expect(ended).toBe(true)
  expect(actual).toBe(text)
})
