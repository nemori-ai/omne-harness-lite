import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  LosslessNumber,
  readOpaqueJson,
  writeJsonLossless,
} from '@omne-harness-lite/content-blocks'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { invokeModel } from '@omne-harness-lite/model-request-runtime-local'
import { type ModelInvocationHandle } from '@omne-harness-lite/model-request-runtime'
import type { ArrivalEvent } from '@omne-harness-lite/arrival-events'
import {
  certificate,
  content,
  finish,
  fixture,
  input,
  invocation,
  planned,
  policy,
  sse,
} from './support.ts'

let cert: ReturnType<typeof certificate>
beforeAll(() => {
  cert = certificate()
})
afterAll(() => cert.dispose())
async function drain(reader: AsyncGenerator<ArrivalEvent, unknown>) {
  const events: ArrivalEvent[] = []
  while (true) {
    const next = await reader.next()
    if (next.done) return { events, end: next.value }
    events.push(next.value)
  }
}
describe('actual HTTPS public invokeModel + transport + core assembler', () => {
  it('sends one immutable request, delivers UTF8 and accounts exact usage/cost once', async () => {
    const host = await fixture(cert.tls, res => {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      // Every byte is a separate write, including the multi-byte Chinese character and CRLF.
      const bytes = Buffer.from(
        sse(
          {
            id: 'gen-actual',
            model: 'reported-model',
            provider: 'actual-provider',
            choices: [{ delta: { content: '你🙂' } }],
          },
          '\r\n',
        ) +
          sse(
            '{"choices":[],"usage":{"prompt_tokens":100,"completion_tokens":3,"prompt_tokens_details":{"cached_tokens":20,"cache_write_tokens":0},"cost":0.000000000000000123456789}}',
          ) +
          finish(),
      )
      for (const byte of bytes) res.write(Buffer.from([byte]))
      res.end()
    })
    try {
      const accepted: ArrivalEvent[] = []
      const handle = invokeModel({
        ...input(),
        transport: host.transport,
        credential: 'test-credential-owner-123',
        signal: new AbortController().signal,
        policy: policy(),
        onAccepted: event => {
          accepted.push(event)
        },
      })
      const result = invocation(await handle.outcome)
      expect(result.outcome).toBe('complete')
      expect(result.blocks).toMatchObject([{ kind: 'text', text: '你🙂' }])
      expect(result.servingProvider).toBe('actual-provider')
      expect(result.provider).toBe('openai')
      expect(result.upstreamModel).toBe('reported-model')
      expect(result.upstreamRequestId).toBe('gen-actual')
      if (result.usage.input_tokens === 'unknown') throw new Error('reported input missing')
      expect(ExactDecimal.from(result.usage.input_tokens).compare(ExactDecimal.from(80))).toBe(0)
      expect(writeJsonLossless(result.usage)).toContain('"cache_write_tokens":0')
      expect(writeJsonLossless(result.cost)).toContain('0.000000000000000123456789')
      expect(accepted.filter(event => event.t === 'account')).toHaveLength(1)
      expect(accepted.filter(event => event.t === 'finish')).toHaveLength(1)
      expect(host.requests).toHaveLength(1)
      expect(host.requests[0]).toMatchObject({ method: 'POST', path: '/api/v1/chat/completions' })
      expect(host.requests[0]?.body).toContain('"allow_fallbacks":false')
      expect(host.requests[0]?.headers).not.toHaveProperty('x-session-id')
      expect(handle.snapshot().firstContentAt).toBeDefined()
      expect(result).not.toHaveProperty('ResponseId')
      expect(result).not.toHaveProperty('tenant')
    } finally {
      await host.close()
    }
  })
  it('keeps first content private until an asynchronous gate succeeds, exactly once', async () => {
    const host = await fixture(cert.tls, res =>
      res.end(content('private') + content('-second') + finish()),
    )
    let release: () => void = () => {}
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    let gates = 0
    const accepted: ArrivalEvent[] = []
    try {
      const handle = invokeModel({
        ...input(),
        transport: host.transport,
        credential: 'test-secret',
        signal: new AbortController().signal,
        policy: policy(),
        beforeFirstContent: () => {
          gates++
          return gate
        },
        onAccepted: event => {
          accepted.push(event)
        },
      })
      await expect.poll(() => gates).toBe(1)
      expect(writeJsonLossless(handle.snapshot())).not.toContain('private')
      expect(handle.snapshot().firstContentAt).toBeUndefined()
      expect(accepted.filter(event => event.t === 'fill')).toHaveLength(0)
      release()
      const result = invocation(await handle.outcome)
      expect(result.outcome).toBe('complete')
      expect(result.blocks).toMatchObject([{ text: 'private-second' }])
      expect(gates).toBe(1)
    } finally {
      release()
      await host.close()
    }
  })
  it('gate rejection stops the network, returns local failure and exposes no blocks', async () => {
    const host = await fixture(cert.tls, res => {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write(content('unapproved'))
    })
    try {
      const handle = invokeModel({
        ...input(),
        transport: host.transport,
        credential: 'test-secret',
        signal: new AbortController().signal,
        policy: policy(),
        beforeFirstContent: async () => {
          throw new Error('durable gate failed')
        },
      })
      const result = invocation(await handle.outcome)
      expect(result.outcome).toBe('failed')
      expect(result.failure).toEqual({ cause: 'unrecognized', localError: 'before_first_content' })
      expect(result.blocks).toEqual([])
      expect(result.timing.firstTokenAt).toBeUndefined()
      await expect.poll(host.closedSockets).toBe(1)
      expect(writeJsonLossless(handle.snapshot())).not.toContain('unapproved')
    } finally {
      await host.close()
    }
  })
  it('explicit cancellation releases a never-resolving content gate and closes its socket', async () => {
    const host = await fixture(cert.tls, res => {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write(content('private'))
    })
    let waiting = false
    try {
      const handle = invokeModel({
        ...input(),
        transport: host.transport,
        credential: 'test-secret',
        signal: new AbortController().signal,
        policy: policy(),
        beforeFirstContent: () => {
          waiting = true
          return new Promise<void>(() => {})
        },
      })
      await expect.poll(() => waiting).toBe(true)
      handle.abort()
      handle.abort()
      const result = invocation(await handle.outcome)
      expect(result.outcome).toBe('interrupted')
      expect(result.blocks).toEqual([])
      expect(result.ending).toBeUndefined()
      expect(result.failure).toBeUndefined()
      await expect.poll(host.closedSockets).toBe(1)
    } finally {
      await host.close()
    }
  })
  it('a pre-send cancellation issues no request, including repeated outcome reads', async () => {
    const host = await fixture(cert.tls, res => res.end(content('bad') + finish()))
    const controller = new AbortController()
    controller.abort()
    try {
      const handle = invokeModel({
        ...input(),
        transport: host.transport,
        credential: 'test-secret',
        signal: controller.signal,
        policy: policy(),
      })
      expect(await handle.outcome).toEqual({ cancelledBeforeSend: true })
      expect(await handle.outcome).toEqual({ cancelledBeforeSend: true })
      expect(host.requests).toHaveLength(0)
    } finally {
      await host.close()
    }
  })
  it('idle-content timeout preserves delivered content, closes the socket and never retries', async () => {
    const host = await fixture(cert.tls, res => {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write(content('partial'))
    })
    try {
      const result = invocation(
        await invokeModel({
          ...input(),
          transport: host.transport,
          credential: 'test-secret',
          signal: new AbortController().signal,
          policy: { ...policy(), idleContentTimeoutMs: 40 },
        }).outcome,
      )
      expect(result.outcome).toBe('failed')
      expect(result.failure?.cause).toBe('interrupted_mid_reply')
      expect(result.blocks).toMatchObject([{ text: 'partial' }])
      expect(result.ending).toBeUndefined()
      expect(host.requests).toHaveLength(1)
      await expect.poll(host.closedSockets).toBe(1)
    } finally {
      await host.close()
    }
  })
  it('buffers raw tool fragments until the name arrives and parses arguments only in the assembler', async () => {
    const host = await fixture(cert.tls, res =>
      res.end(
        sse({
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: new LosslessNumber('9007199254740993'),
                    function: { arguments: '{"large":9007199' },
                  },
                ],
              },
            },
          ],
        }) +
          sse({
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: new LosslessNumber('9007199254740993'),
                      function: { name: 'lookup', arguments: '254740993}' },
                    },
                  ],
                },
              },
            ],
          }) +
          finish('tool_calls'),
      ),
    )
    try {
      // SSE input must use lossless serialization, not JSON.stringify(LosslessNumber).
      const result = invocation(
        await invokeModel({
          ...input(),
          transport: host.transport,
          credential: 'test-secret',
          signal: new AbortController().signal,
          policy: policy(),
        }).outcome,
      )
      expect(result.outcome).toBe('complete')
      expect(result.blocks).toMatchObject([{ kind: 'tool_call', tool: 'lookup', complete: true }])
      expect(writeJsonLossless(result.blocks)).toContain('9007199254740993')
    } finally {
      await host.close()
    }
  })
  it('preserves opaque reasoning details and final upstream facts without request-value substitution', async () => {
    const host = await fixture(cert.tls, res =>
      res.end(
        sse(
          '{"choices":[{"delta":{"reasoning":"thinking","reasoning_details":[{"type":"reasoning.encrypted","data":"opaque","index":9007199254740993}]}}]}',
        ) +
          content('answer') +
          finish(),
      ),
    )
    try {
      const result = invocation(
        await invokeModel({
          ...input(),
          transport: host.transport,
          credential: 'test-secret',
          signal: new AbortController().signal,
          policy: policy(),
        }).outcome,
      )
      const block = result.blocks.find(block => block.kind === 'thinking')
      if (!block || block.kind !== 'thinking' || !block.opaque)
        throw new Error('no opaque reasoning')
      expect(writeJsonLossless(readOpaqueJson(block.opaque))).toContain('9007199254740993')
      expect(result.servingProvider).toBeUndefined()
      expect(result.upstreamModel).toBeUndefined()
    } finally {
      await host.close()
    }
  })
  it('length does not close producer blocks, and the assembler returns a truncated tool call', async () => {
    const host = await fixture(cert.tls, res =>
      res.end(
        sse({
          choices: [
            {
              delta: {
                tool_calls: [{ index: 0, function: { name: 'lookup', arguments: '{"x":' } }],
              },
            },
          ],
        }) + finish('length'),
      ),
    )
    try {
      const accepted: ArrivalEvent[] = []
      const result = invocation(
        await invokeModel({
          ...input(),
          transport: host.transport,
          credential: 'test-secret',
          signal: new AbortController().signal,
          policy: policy(),
          onAccepted: event => {
            accepted.push(event)
          },
        }).outcome,
      )
      expect(result.outcome).toBe('truncated')
      expect(result.blocks).toMatchObject([
        { kind: 'tool_call', complete: false, rawArguments: '{"x":' },
      ])
      expect(accepted.some(event => event.t === 'close')).toBe(false)
    } finally {
      await host.close()
    }
  })
  it.each([
    ['duplicate JSON key', 'data: {"choices":[],"choices":[]}\n\n'],
    ['unsupported content', sse({ choices: [{ delta: { audio: { id: 'unsupported' } } }] })],
    ['invalid UTF8', Buffer.from([0x64, 0x61, 0x74, 0x61, 0x3a, 0x20, 0xff, 0x0a, 0x0a])],
    [
      'content after finish',
      content('part') +
        sse({ choices: [{ delta: {}, finish_reason: 'stop' }] }) +
        content('forbidden') +
        sse('[DONE]'),
    ],
    ['premature EOF', content('part')],
  ])('classifies %s without fabricating normal close or resending', async (_name, body) => {
    const host = await fixture(cert.tls, res => res.end(body))
    try {
      const result = invocation(
        await invokeModel({
          ...input(),
          transport: host.transport,
          credential: 'test-secret',
          signal: new AbortController().signal,
          policy: policy(),
        }).outcome,
      )
      expect(result.outcome).toBe('failed')
      expect(result.ending).toBeUndefined()
      expect(host.requests).toHaveLength(1)
    } finally {
      await host.close()
    }
  })
  it('rejects over-limit SSE frames instead of silently truncating them', async () => {
    const host = await fixture(cert.tls, res => res.end(content('a'.repeat(400)) + finish()), {
      maxSseEventBytes: 128,
    })
    try {
      const result = invocation(
        await invokeModel({
          ...input(),
          transport: host.transport,
          credential: 'test-secret',
          signal: new AbortController().signal,
          policy: policy(),
        }).outcome,
      )
      expect(result.outcome).toBe('failed')
      expect(result.blocks).toEqual([])
      expect(result.failure?.localError).toBe('SSE event exceeds configured limit')
    } finally {
      await host.close()
    }
  })
  it('retains raw in-band status spelling and redacts credential echoes', async () => {
    const host = await fixture(cert.tls, res =>
      res.end(sse('{"error":{"code":4.29e2,"message":"test-secret-credential"}}')),
    )
    try {
      const result = invocation(
        await invokeModel({
          ...input(),
          transport: host.transport,
          credential: 'test-secret-credential',
          signal: new AbortController().signal,
          policy: policy(),
        }).outcome,
      )
      expect(result.outcome).toBe('failed')
      expect(result.failure?.cause).toBe('upstream_unavailable')
      expect(result.failure?.inBand).toBe(true)
      expect(writeJsonLossless(result.failure)).toContain('4.29e2')
      expect(writeJsonLossless(result)).not.toContain('test-secret-credential')
    } finally {
      await host.close()
    }
  })
  it.each([429, 503, 302])(
    'HTTP %i remains a single request with no redirects or hidden retries',
    async status => {
      const host = await fixture(cert.tls, res => {
        res.writeHead(status, { location: 'https://127.0.0.1:1/unreachable' })
        res.end('{"error":{"message":"test-secret-credential"}}')
      })
      try {
        const result = invocation(
          await invokeModel({
            ...input(),
            transport: host.transport,
            credential: 'test-secret-credential',
            signal: new AbortController().signal,
            policy: policy(),
          }).outcome,
        )
        expect(result.outcome).toBe('failed')
        expect(host.requests).toHaveLength(1)
        expect(result.failure?.statusCode).toBe(status)
        expect(writeJsonLossless(result)).not.toContain('test-secret-credential')
      } finally {
        await host.close()
      }
    },
  )
  it('never opens two competing readers for the same live response', async () => {
    const host = await fixture(cert.tls, res => res.end(content('text') + finish()))
    try {
      const plan = await planned(host.transport)
      const signal = new AbortController().signal
      const sent = await host.transport.send(plan, 'test-secret', signal)
      if (!('response' in sent)) throw new Error('send failed')
      const reader = host.transport.read(sent.response, plan, signal)
      await reader.next()
      await expect(host.transport.read(sent.response, plan, signal).next()).resolves.toMatchObject({
        done: true,
        value: { rejected: 'invalidInput' },
      })
      const collected = await drain(reader)
      expect(collected.events.some(event => event.t === 'finish')).toBe(false)
      expect(collected.end).toMatchObject({ ended: 'end' })
    } finally {
      await host.close()
    }
  })
  it('late cancellation from a final close callback cannot overwrite normal termination', async () => {
    const host = await fixture(cert.tls, res => res.end(content('complete') + finish()))
    let handle: ModelInvocationHandle | undefined
    try {
      handle = invokeModel({
        ...input(),
        transport: host.transport,
        credential: 'test-secret',
        signal: new AbortController().signal,
        policy: policy(),
        onAccepted: event => {
          if (event.t === 'close') handle?.abort()
        },
      })
      expect(invocation(await handle.outcome).outcome).toBe('complete')
    } finally {
      await host.close()
    }
  })
  it('a missing first-content deadline stops an actual heartbeat-only socket', async () => {
    let heartbeatWritten = false,
      responseReceived = false,
      fired = 0
    let firstDeadline: (() => void) | undefined
    const scheduledMilliseconds: number[] = []
    const host = await fixture(cert.tls, res => {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write(sse({ choices: [{ delta: { role: 'assistant' } }] }))
      heartbeatWritten = true
    })
    try {
      const handle = invokeModel({
        ...input(),
        transport: {
          ...host.transport,
          send: async (...args: Parameters<typeof host.transport.send>) => {
            const sent = await host.transport.send(...args)
            if ('response' in sent) responseReceived = true
            return sent
          },
        },
        credential: 'test-secret',
        signal: new AbortController().signal,
        policy: {
          ...policy(),
          firstContentTimeoutMs: 40,
          // This case tests stopping an acquired heartbeat response. A wall-clock
          // deadline may instead win before TLS exists when other suites compete.
          schedule: (milliseconds, callback) => {
            scheduledMilliseconds.push(milliseconds)
            firstDeadline = () => {
              fired++
              callback()
            }
            return () => {
              firstDeadline = undefined
            }
          },
        },
      })
      await expect.poll(() => host.requests.length).toBe(1)
      await expect.poll(() => responseReceived).toBe(true)
      expect(heartbeatWritten).toBe(true)
      expect(scheduledMilliseconds).toEqual([40])
      const fire = firstDeadline
      if (!fire) throw new Error('first-content deadline was not registered')
      fire()
      const result = invocation(await handle.outcome)
      expect(fired).toBe(1)
      expect(firstDeadline).toBeUndefined()
      expect(result.outcome).toBe('failed')
      expect(result.failure?.localError).toBe('first_content_timeout')
      expect(result.timing.firstTokenAt).toBeUndefined()
      expect(result.blocks).toEqual([])
      expect(host.requests).toHaveLength(1)
      await expect.poll(host.closedSockets).toBe(1)
    } finally {
      await host.close()
    }
  })
  it('oversized HTTP error bodies are discarded whole and the actual socket stops', async () => {
    const host = await fixture(
      cert.tls,
      res => {
        res.writeHead(503)
        res.end('x'.repeat(200))
      },
      { maxErrorBodyBytes: 64 },
    )
    try {
      const result = invocation(
        await invokeModel({
          ...input(),
          transport: host.transport,
          credential: 'test-secret',
          signal: new AbortController().signal,
          policy: policy(),
        }).outcome,
      )
      expect(result.outcome).toBe('failed')
      expect(result.failure?.statusCode).toBe(503)
      expect(result.failure?.upstreamError).toBeUndefined()
      expect(host.requests).toHaveLength(1)
      await expect.poll(host.closedSockets).toBe(1)
    } finally {
      await host.close()
    }
  })
  it('observer failures do not alter a normal business result', async () => {
    const host = await fixture(cert.tls, res => res.end(content('valid') + finish()))
    const diagnostics: string[] = []
    try {
      const result = invocation(
        await invokeModel({
          ...input(),
          transport: host.transport,
          credential: 'test-secret',
          signal: new AbortController().signal,
          policy: {
            ...policy(),
            diagnostic: event => {
              diagnostics.push(event.kind)
            },
          },
          onAccepted: () => {
            throw new Error('observer failed')
          },
        }).outcome,
      )
      expect(result.outcome).toBe('complete')
      expect(diagnostics).toContain('model_invocation.observer_failed')
    } finally {
      await host.close()
    }
  })
  it('cancelling a queued send does not borrow a socket or wait for the first invocation', async () => {
    const host = await fixture(
      cert.tls,
      res => {
        res.writeHead(200, { 'content-type': 'text/event-stream' })
        res.write(content('first'))
      },
      { maxConnections: 1 },
    )
    const first = invokeModel({
      ...input(),
      transport: host.transport,
      credential: 'test-secret',
      signal: new AbortController().signal,
      policy: policy(),
    })
    try {
      await expect.poll(() => host.requests.length).toBe(1)
      let entered = () => {}
      const queued = new Promise<void>(resolve => {
        entered = resolve
      })
      const second = invokeModel({
        ...input(),
        transport: {
          ...host.transport,
          send(...args) {
            entered()
            return host.transport.send(...args)
          },
        },
        credential: 'test-secret',
        signal: new AbortController().signal,
        policy: policy(),
      })
      // Wait for asynchronous planning to finish and the real connection queue to admit this owner.
      await queued
      second.abort()
      const result = await Promise.race([
        second.outcome,
        new Promise<never>((_resolve, reject) => {
          setTimeout(() => reject(new Error('queued cancellation did not drain')), 500)
        }),
      ])
      expect(invocation(result).outcome).toBe('interrupted')
      expect(host.requests).toHaveLength(1)
    } finally {
      first.abort()
      await first.outcome
      await host.close()
    }
  })
  it('an actual connection-queue deadline remains a local failure with zero second HTTP', async () => {
    const host = await fixture(
      cert.tls,
      res => {
        res.writeHead(200, { 'content-type': 'text/event-stream' })
        res.write(content('first'))
      },
      { maxConnections: 1 },
    )
    const first = invokeModel({
      ...input(),
      transport: host.transport,
      credential: 'test-secret',
      signal: new AbortController().signal,
      policy: policy(),
    })
    try {
      await expect.poll(() => host.requests.length).toBe(1)
      const second = invokeModel({
        ...input(),
        transport: host.transport,
        credential: 'test-secret',
        signal: new AbortController().signal,
        policy: { ...policy(), firstContentTimeoutMs: 40 },
      })
      const result = invocation(await second.outcome)
      expect(result.outcome).toBe('failed')
      expect(result.failure).toEqual({ cause: 'unrecognized', localError: 'local_queue_timeout' })
      expect(host.requests).toHaveLength(1)
    } finally {
      first.abort()
      await first.outcome
      await host.close()
    }
  })
  it('invalid credentials and a closed provider return explicit rejection before networking', async () => {
    const host = await fixture(cert.tls, res => res.end(content('unused') + finish()))
    try {
      const plan = await planned(host.transport),
        signal = new AbortController().signal
      expect(await host.transport.send(plan, '', signal)).toEqual({ rejected: 'invalidInput' })
      expect(await host.transport.send(plan, 'invalid\nheader', signal)).toEqual({
        rejected: 'invalidInput',
      })
      await host.transport.close()
      expect(await host.transport.send(plan, 'test-secret', signal)).toEqual({
        rejected: 'unavailable',
      })
      expect(host.requests).toHaveLength(0)
    } finally {
      await host.close()
    }
  })

  it.each([400, 401, 402, 403, 404, 408, 413, 429, 500, 502, 503, 504, 418, 302])(
    'retains HTTP %i headers and separate repeated values after credential redaction',
    async status => {
      const credential = 'credential-secret-sentinel'
      const host = await fixture(cert.tls, res => {
        res.writeHead(status, {
          'content-type': 'application/json',
          'x-upstream-request-id': 'upstream-id',
          'set-cookie': ['first=1', 'second=2'],
          'x-credential-echo': credential,
        })
        res.end(JSON.stringify({ error: { message: credential } }))
      })
      try {
        const result = await host.transport.send(
          await planned(host.transport),
          credential,
          new AbortController().signal,
        )
        if (!('failed' in result)) throw new Error('expected actual HTTP failure')
        expect(result.failed.statusCode).toBe(status)
        expect(result.failed.source).toBe('http_status')
        expect(result.rawHeaders).toMatchObject({
          'x-upstream-request-id': 'upstream-id',
        })
        expect(result.rawHeaders).not.toHaveProperty('set-cookie')
        const redacted = writeJsonLossless(result.failed)
        for (let index = 0; index <= credential.length - 8; index++)
          expect(redacted).not.toContain(credential.slice(index, index + 8))
        expect(Object.isFrozen(result.rawHeaders)).toBe(true)
        expect(result.failed).not.toHaveProperty('headers')
        expect(writeJsonLossless(result.failed)).not.toContain(credential)
        expect(host.requests).toHaveLength(1)
        // A fully consumed error response may leave an idle keep-alive socket.
        // Closing the owning transport must still release that real resource.
        await host.transport.close()
        await expect.poll(host.closedSockets).toBe(1)
      } finally {
        await host.close()
      }
    },
  )

  it('retains failure headers even when the error body exceeds its bound', async () => {
    const host = await fixture(
      cert.tls,
      res => {
        res.writeHead(429, { 'x-upstream-request-id': 'oversized-id' })
        res.end('too large to retain')
      },
      { maxErrorBodyBytes: 4 },
    )
    try {
      const result = await host.transport.send(
        await planned(host.transport),
        'test-secret',
        new AbortController().signal,
      )
      if (!('failed' in result)) throw new Error('expected actual HTTP failure')
      expect(result.rawHeaders?.['x-upstream-request-id']).toBe('oversized-id')
      expect(result.failed.statusCode).toBe(429)
      expect(result.failed.upstreamError).toBeUndefined()
      await expect.poll(host.closedSockets).toBe(1)
    } finally {
      await host.close()
    }
  })

  it('owns invocation policy values while an actual response is pending', async () => {
    let respond = () => {}
    const host = await fixture(cert.tls, res => {
      respond = () => {
        res.writeHead(503)
        res.end('{"error":{"message":"busy"}}')
      }
    })
    const table = { ...policy().statusCauseTable }
    const supplied = { ...policy(), statusCauseTable: table }
    try {
      const handle = invokeModel({
        ...input(),
        transport: host.transport,
        credential: 'test-secret',
        signal: new AbortController().signal,
        policy: supplied,
      })
      await expect.poll(() => host.requests.length).toBe(1)
      table['503'] = 'request_rejected'
      supplied.now = async () => {
        throw new Error('late policy replacement')
      }
      supplied.credentialRedaction = { ...supplied.credentialRedaction, credential_patterns: [] }
      respond()
      const result = invocation(await handle.outcome)
      expect(result.failure?.cause).toBe('upstream_unavailable')
      expect(result.outcome).toBe('failed')
      expect(host.requests).toHaveLength(1)
    } finally {
      await host.close()
    }
  })

  it('diagnoses negative input-token relationships without fabricating zero counts', async () => {
    const diagnostics: string[] = []
    const host = await fixture(
      cert.tls,
      res => {
        res.end(
          content('ok') +
            sse({
              usage: {
                prompt_tokens: new LosslessNumber('9007199254740993'),
                prompt_tokens_details: {
                  cached_tokens: new LosslessNumber('9007199254740994'),
                  cache_write_tokens: 0,
                },
                completion_tokens: 1,
                cost: new LosslessNumber('0.00000000000000000012345'),
              },
            }) +
            finish(),
        )
      },
      {},
      event => {
        diagnostics.push(event.kind)
      },
    )
    try {
      const result = invocation(
        await invokeModel({
          ...input(),
          transport: host.transport,
          credential: 'test-secret',
          signal: new AbortController().signal,
          policy: policy(),
        }).outcome,
      )
      expect(result.outcome).toBe('complete')
      expect(result.usage).toMatchObject({
        input_tokens: 'unknown',
        cache_read_tokens: new LosslessNumber('9007199254740994'),
        cache_write_tokens: 0,
        output_tokens: 1,
      })
      expect(
        diagnostics.filter(kind => kind === 'model_transport.usage_inconsistent'),
      ).toHaveLength(1)
      expect(writeJsonLossless(result.cost)).toContain('0.00000000000000000012345')
      expect(host.requests).toHaveLength(1)
    } finally {
      await host.close()
    }
  })
})
