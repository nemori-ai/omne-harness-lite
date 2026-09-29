import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import type { ArrivalEvent } from '@omne-harness-lite/arrival-events'
import type { StreamEnd } from '@omne-harness-lite/model-request-runtime'
import { certificate, fixture, planned, content, sse, finish } from './support.ts'
let cert: ReturnType<typeof certificate>
beforeAll(() => {
  cert = certificate()
})
afterAll(() => cert.dispose())
async function drain(reader: AsyncGenerator<ArrivalEvent, StreamEnd>) {
  while (true) {
    const next = await reader.next()
    if (next.done) return next.value
  }
}
const usage = {
  prompt_tokens: 123,
  completion_tokens: 4,
  prompt_tokens_details: { cached_tokens: 100 },
}
describe('real TLS reader terminal handoff', () => {
  for (const hasUsage of [false, true])
    it(`cancel hanging upstream after content; parsed usage ${hasUsage}`, async () => {
      const host = await fixture(cert.tls, res => {
        res.writeHead(200, { 'content-type': 'text/event-stream' })
        res.write(
          (hasUsage ? sse({ choices: [], usage }) : '') + content('one'),
        ) /* deliberately never end */
      })
      try {
        const request = await planned(host.transport),
          controller = new AbortController()
        const sent = await host.transport.send(request, 'test-only-credential', controller.signal)
        if (!('response' in sent)) throw Error('not sent')
        const reader = host.transport.read(sent.response, request, controller.signal)
        expect((await reader.next()).done).toBe(false)
        controller.abort()
        const ended = await drain(reader)
        expect(ended).toMatchObject({ aborted: true })
        expect(ended.readFacts.observedInput).toMatchObject(
          hasUsage
            ? { kind: 'upstream_total', tokens: 123 }
            : { kind: 'unavailable', reason: 'missing_usage' },
        )
        await sent.response.stopped
        expect(host.requests).toHaveLength(1)
      } finally {
        await host.close()
      }
    }, 3000)
  for (const ending of ['invalid-json', 'in-band', 'normal', 'cache-hit'])
    it(`usage preserved on ${ending}`, async () => {
      const host = await fixture(cert.tls, res => {
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          ...(ending === 'cache-hit' ? { 'X-OpenRouter-Cache-Status': 'HIT' } : {}),
        })
        if (ending === 'in-band')
          res.end(sse({ usage, error: { code: 429, message: 'throttled' } }))
        else
          res.end(
            sse({ usage, choices: [] }) +
              (ending === 'invalid-json' ? 'data: {invalid}\n\n' : content('ok') + finish()),
          )
      })
      try {
        const request = await planned(host.transport),
          signal = new AbortController().signal
        const sent = await host.transport.send(request, 'test-only-credential', signal)
        if (!('response' in sent)) throw Error('not sent')
        const ended = await drain(host.transport.read(sent.response, request, signal))
        expect(ended.readFacts.usage.output_tokens).toBe(4)
        expect(ended.readFacts.observedInput).toMatchObject(
          ending === 'cache-hit'
            ? { kind: 'unavailable', reason: 'response_cache' }
            : { kind: 'upstream_total', tokens: 123 },
        )
        await sent.response.stopped
      } finally {
        await host.close()
      }
    })
})
