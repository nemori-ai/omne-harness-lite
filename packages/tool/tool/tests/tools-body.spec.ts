import { afterEach, expect, it } from 'vitest'
import {
  sourceFixture,
  result,
  visible,
  token,
  registeredFixture,
  options,
} from './tools-values.ts'
import { ok } from './runtime-values.ts'
import { sealedText } from './settlement-values.ts'
import { auditQueues } from './start-values.ts'

afterEach(auditQueues)

it('presents a callable body reference and reads UTF-8 text through the invocation runtime', async () => {
  const expected = '\ufeff中🙂'.repeat(7)
  const f = await sourceFixture(
    async (_raw, ledger, access) => ({
      ...result([visible('summary', 'summary only')]),
      original: {
        kind: 'offloaded',
        source: (await sealedText(ledger, access, expected)).source,
        summary: [visible('summary', 'summary only')],
      },
    }),
    { contentPageBytes: 7 },
  )
  const initial = await f.tools.present(f.access)
  const reference = token(initial, 'bodyReference')
  expect(reference).toMatch(/^tb1\./u)
  let after: string | null = null
  let actual = ''
  const registered = registeredFixture(f.tools)
  for (let index = 0; index < 30; index += 1) {
    const page = ok(
      (await registered.invoke('read_result', { kind: 'body', reference, after })).full,
    )
    const text = page.content.find(block => block.id === 'Tools.body')
    expect(text?.kind).toBe('text')
    if (text?.kind !== 'text') throw new Error('expected body text')
    actual += text.text
    const next = token(page, 'next')
    if (next === 'null') break
    after = next
  }
  expect(actual).toBe(expected)
})

it('shrinks the body budget without advancing past text omitted from the actual JSON reply', async () => {
  const expected = '中🙂"\\\n'.repeat(600)
  const limits = { ...options, contentPageBytes: 4096, resultPageBytes: 4096, replyMaxBytes: 4096 }
  const f = await sourceFixture(
    async (_raw, ledger, access) => ({
      ...result([visible('summary', 'summary only')]),
      original: {
        kind: 'offloaded',
        source: (await sealedText(ledger, access, expected)).source,
        summary: [visible('summary', 'summary only')],
      },
    }),
    limits,
  )
  const reference = token(await f.tools.present(f.access), 'bodyReference')
  let after: string | null = null
  let actual = ''
  let pages = 0
  for (; pages < 100; pages += 1) {
    const page = await f.tools.read({ ...f.access, arguments: { kind: 'body', reference, after } })
    expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThanOrEqual(limits.replyMaxBytes)
    const text = page.content.find(block => block.id === 'Tools.body')
    if (text?.kind !== 'text') throw new Error('missing text page')
    actual += text.text
    const next = token(page, 'next')
    if (next === 'null') break
    after = next
  }
  expect(pages).toBeGreaterThan(1)
  expect(actual).toBe(expected)
})

it.each([5, 6])('only emits a continuation accepted by its %i-item budget', async maxItems => {
  const f = await sourceFixture(
    async (_raw, ledger, access) => ({
      ...result([visible('summary', 'summary')]),
      original: {
        kind: 'offloaded',
        source: (await sealedText(ledger, access, 'abcdef')).source,
        summary: [visible('summary', 'summary')],
      },
    }),
    { contentPageBytes: 2, arguments: { ...options.arguments, maxItems } },
  )
  const reference = token(await f.tools.present(f.access), 'bodyReference')
  const page = await f.tools.read({
    ...f.access,
    arguments: { kind: 'body', reference, after: null },
  })
  if (maxItems === 5) {
    expect(page.content.some(block => block.id === 'Tools.body')).toBe(false)
    expect(page.content.map(block => (block.kind === 'text' ? block.text : '')).join('')).toContain(
      'unsupported',
    )
  } else {
    const next = token(page, 'next')
    expect(next).toMatch(/^tc1\./u)
    const second = await f.tools.read({
      ...f.access,
      arguments: { kind: 'body', reference, after: next },
    })
    expect(second.content.find(block => block.id === 'Tools.body')).toMatchObject({ text: 'cd' })
  }
})
