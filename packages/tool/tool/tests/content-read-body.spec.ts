// `content.read` on the source of an authored offloaded result reads the sealed body bytes back
// from the body store, page by page, under the same ledger checks as `read_result`.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { sealedText, settlementFixture } from './settlement-values.ts'
import { auditQueues } from './start-values.ts'
import { ok, text } from './runtime-values.ts'

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
afterEach(async () => {
  vi.useRealTimers()
  await auditQueues()
})

it('reads the bytes of an authored offloaded body through content.read', async () => {
  const body = 'the authored body, read back as bytes'
  const f = await settlementFixture({
    value: async (ledger, access) => {
      const sealed = await sealedText(ledger, access, body)
      return {
        content: [text('content', 'Answer: 42')],
        data: { kind: 'none' },
        attachments: [],
        original: { kind: 'offloaded', source: sealed.source, summary: [text('summary', 'brief')] },
      }
    },
  })
  ok(await f.preserve())
  const page = await f.resultPage()
  const result = (await f.load()).result
  if (result === null) throw new Error('expected a committed result')
  const original = page.value.original
  if (original.kind !== 'offloaded') throw new Error('expected an offloaded result')
  const read = ok(
    await f.ledger.reads.content.read({
      ...f.access,
      result: result.version,
      attachment: original.source,
      after: null,
      maxBytes: 4096,
    }),
  )
  expect(Buffer.from(read.bytes).toString('utf8')).toBe(body)
  expect(read.next).toBeNull()
})
