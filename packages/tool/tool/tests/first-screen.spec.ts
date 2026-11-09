import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { settlementFixture } from './settlement-values.ts'
import { auditQueues } from './start-values.ts'
import { configuration, ok, text } from './runtime-values.ts'

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
afterEach(async () => {
  vi.useRealTimers()
  await auditQueues()
})

const L = 8192
const P = Math.min(configuration().offloading.previewUtf8Bytes, Math.floor(L / 8))

async function firstScreen(body: string): Promise<string> {
  const f = await settlementFixture({
    offloading: { ...configuration().offloading, maxInlineUtf8Bytes: L },
    value: {
      content: [text('answer', body)],
      data: { kind: 'none' },
      original: { kind: 'none' },
      attachments: [],
    },
  })
  expect(ok(await f.preserve()).phase).toBe('settled')
  const value = (await f.resultPage()).value
  expect(value.original.kind).toBe('offloaded')
  return value.content
    .flatMap(block => (block.kind === 'text' && block.visibility.toModel ? [block.text] : []))
    .join('')
}

const bytes = (text: string) => Buffer.byteLength(text, 'utf8')

it.each([L + 1, 100 * L])('keeps the first screen of a %i-byte text body within L', async size => {
  const line = 'line of body text\n'
  const body = line.repeat(Math.ceil(size / bytes(line))).slice(0, size)
  const screen = await firstScreen(body)
  const [preview = '', header = ''] = screen.split(/(?=\n\[offloaded body\]\n)/u)
  expect(bytes(preview)).toBeLessThanOrEqual(P)
  expect(bytes(screen)).toBeLessThanOrEqual(L)
  expect(header).toContain(`Body bytes: ${size}`)
  expect(header).not.toContain('{')
  expect(preview).toMatch(
    /^(line of body text\n)+\[\.\.\. omitted \.\.\.\]\n(line of body text\n)*/u,
  )
})

it('cuts a single long line at a character boundary and labels the cut', async () => {
  const preview = (await firstScreen('汉'.repeat(L))).split('\n[offloaded body]\n')[0] ?? ''
  expect(bytes(preview)).toBeLessThanOrEqual(P)
  expect(preview).toContain('[line cut at a character boundary]')
  expect(preview.replace(/\[[^\]]*\]|\n/gu, '')).toMatch(/^汉+$/u)
})
