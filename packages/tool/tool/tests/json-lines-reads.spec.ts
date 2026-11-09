import { afterEach, expect, it } from 'vitest'
import { jsonLinesFixture } from './structured-body-values.ts'
import { sourceFixture, registeredFixture, token, options } from './tools-values.ts'
import { ok } from './runtime-values.ts'
import { auditQueues } from './start-values.ts'
import { settlementFixture } from './settlement-values.ts'
import { writeJsonText } from '@omne-harness/json-text'

afterEach(auditQueues)

it('reads complete JSON Lines records through registered Tools without changing numeric lexemes', async () => {
  const lines = ['{"amount":1.00,"label":"中🙂"}', '{"amount":2e0}', '{"amount":3,"label":"a\\nb"}']
  const document = jsonLinesFixture(lines)
  const f = await sourceFixture(document.value, { contentPageBytes: 40 }, [], document)
  const reference = token(await f.tools.present(f.access), 'bodyReference')
  const registered = registeredFixture(f.tools)
  let after: string | null = null
  const actual: string[] = []
  for (let pages = 0; pages < 10; pages++) {
    const result = ok(
      (await registered.invoke('read_result', { kind: 'body', reference, after })).full,
    )
    const page = result.content.find(block => block.id === 'Tools.body')
    if (page?.kind !== 'text') throw new Error(`record page missing: ${JSON.stringify(result)}`)
    expect(token(result, 'format')).toBe('json-lines')
    expect(JSON.parse(token(result, 'recordSchema'))).toEqual(document.schema)
    expect(Buffer.byteLength(page.text)).toBeLessThanOrEqual(40)
    expect(page.text.endsWith('\n')).toBe(true)
    actual.push(...page.text.slice(0, -1).split('\n'))
    const next = token(result, 'next')
    if (next === 'null') break
    expect(next).not.toBe(after)
    after = next
  }
  expect(actual).toEqual(lines)
})

it('reports a record that cannot fit instead of returning a truncated or empty continuation page', async () => {
  const document = jsonLinesFixture(['{"name":"中文🙂"}'])
  const f = await sourceFixture(document.value, { contentPageBytes: 8 }, [], document)
  const reference = token(await f.tools.present(f.access), 'bodyReference')
  const result = await f.tools.read({
    ...f.access,
    arguments: { kind: 'body', reference, after: null },
  })
  const status = result.content.find(block => block.id === 'Tools.status')
  expect(status).toMatchObject({ kind: 'text', text: expect.stringContaining('record-too-large') })
  expect(token(result, 'position')).toBe('0')
  expect(result.content.some(block => block.id === 'Tools.body')).toBe(false)
})

it('keeps record boundaries with one-byte store pages and rejects a cursor inside a record', async () => {
  const lines = ['{"text":"中🙂","number":1.00}', '{"number":2e0}']
  const document = jsonLinesFixture(lines)
  const f = await settlementFixture(document)
  ok(await f.preserve())
  const result = await f.resultPage()
  if (result.value.original.kind !== 'offloaded') throw new Error('body required')
  const input = {
    ...f.access,
    result: result.result,
    bodyId: result.value.original.bodyId,
    after: null,
    maxBytes: Buffer.byteLength(lines[0]!) + 1,
  }
  const first = ok(await f.ledger.reads.body.read(input))
  if (first.kind !== 'json-lines' || first.next === null) throw new Error('record page required')
  expect(first.records.map(writeJsonText)).toEqual([lines[0]])
  const wrong = JSON.parse(first.next)
  wrong.offset = '1'
  expect(await f.ledger.reads.body.read({ ...input, after: JSON.stringify(wrong) })).toMatchObject({
    failure: { kind: 'invalid-cursor', reason: 'another-body-or-invalid-position' },
  })
  const second = ok(await f.ledger.reads.body.read({ ...input, after: first.next }))
  if (second.kind !== 'json-lines') throw new Error('record page required')
  expect(second.records.map(writeJsonText)).toEqual([lines[1]])
  expect(second.next).toBeNull()
})

it('returns one empty final record page for an empty sealed stream', async () => {
  const document = jsonLinesFixture([])
  const f = await sourceFixture(document.value, {}, [], document)
  const reference = token(await f.tools.present(f.access), 'bodyReference')
  const result = await f.tools.read({
    ...f.access,
    arguments: { kind: 'body', reference, after: null },
  })
  expect(token(result, 'records')).toBe('0')
  expect(token(result, 'next')).toBe('null')
  expect(result.content.find(block => block.id === 'Tools.body')).toMatchObject({
    kind: 'text',
    text: '',
  })
})

it('shrinks serialized Tools replies only at complete record boundaries', async () => {
  const lines = Array.from({ length: 12 }, (_, row) =>
    JSON.stringify({ row, text: '中🙂"\\\n'.repeat(45) }),
  )
  const document = jsonLinesFixture(lines)
  const limits = { ...options, contentPageBytes: 4096, resultPageBytes: 4096, replyMaxBytes: 4096 }
  const f = await sourceFixture(document.value, limits, [], document)
  const reference = token(await f.tools.present(f.access), 'bodyReference')
  let after: string | null = null
  const actual: string[] = []
  let ended = false
  for (let pageNumber = 0; pageNumber < 24; pageNumber++) {
    const result = await f.tools.read({
      ...f.access,
      arguments: { kind: 'body', reference, after },
    })
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(limits.replyMaxBytes)
    const page = result.content.find(block => block.id === 'Tools.body')
    if (page?.kind !== 'text') throw new Error(`record page missing: ${JSON.stringify(result)}`)
    actual.push(...page.text.slice(0, -1).split('\n'))
    const next = token(result, 'next')
    if (next === 'null') {
      ended = true
      break
    }
    expect(next).not.toBe(after)
    after = next
  }
  expect(ended).toBe(true)
  expect(actual).toEqual(lines)
})
