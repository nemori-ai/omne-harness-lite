import { imagePreparation } from './image-transport-support.ts'
import { Agent } from 'node:https'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  createCredentialRedactionPolicy,
  invokeModel,
  openRouterCredentialRedactionConfig,
  type StreamEnd,
} from '@omne-harness-lite/model-request-runtime'
import type { ArrivalEvent } from '@omne-harness-lite/arrival-events'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import {
  createPiAiTransport,
  sendRequest,
  type NetworkResources,
} from '@omne-harness-lite/pi-ai-transport'
import { piAiTransportPlugin } from '@omne-harness-lite/pi-ai-transport/plugin'
import { testDefinitions } from './definitions.ts'
import {
  certificate,
  content,
  finish,
  fixture,
  input,
  invocation,
  networkPolicy,
  planned,
  policy,
  sse,
} from './support.ts'

const faults = vi.hoisted(() => ({
  stage: '' as 'bind' | 'headers' | 'json' | 'text' | '',
  rejected: false,
  invalidHeaders: false,
  onProcess: undefined as (() => void) | undefined,
}))
vi.mock('@omne-harness-lite/model-request-runtime', async importOriginal => {
  const original = await importOriginal<typeof import('@omne-harness-lite/model-request-runtime')>()
  const reject = { rejected: 'invalidInput' } as const
  return {
    ...original,
    createCredentialRedactionPolicy: (
      ...args: Parameters<typeof createCredentialRedactionPolicy>
    ) => {
      const actual = original.createCredentialRedactionPolicy(...args)
      return {
        bind(credential: string) {
          if (faults.stage === 'bind') {
            if (faults.rejected) return reject
            throw new Error('synthetic-secret-in-defect')
          }
          const binding = actual.bind(credential)
          if ('rejected' in binding) return binding
          const bound = binding.ok
          return {
            ok: {
              text(value: string) {
                if (faults.stage === 'text') {
                  if (faults.rejected) return reject
                  throw new Error('synthetic-secret-in-defect')
                }
                return bound.text(value)
              },
              headers(value: Parameters<typeof bound.headers>[0]) {
                if (faults.invalidHeaders) {
                  const invalid = { ...value }
                  Object.defineProperty(invalid, 'bad', { value: 7, enumerable: true })
                  return bound.headers(invalid)
                }
                if (faults.stage === 'headers') {
                  if (faults.rejected) return reject
                  throw new Error('synthetic-secret-in-defect')
                }
                return bound.headers(value)
              },
              json(value: Parameters<typeof bound.json>[0]) {
                if (faults.stage === 'json') {
                  faults.onProcess?.()
                  if (faults.rejected) return reject
                  throw new Error('synthetic-secret-in-defect')
                }
                return bound.json(value)
              },
            },
          }
        },
      }
    },
  }
})
let cert: ReturnType<typeof certificate>
beforeAll(() => {
  cert = certificate()
})
afterAll(() => cert.dispose())
afterEach(() => {
  faults.stage = ''
  faults.rejected = false
  faults.invalidHeaders = false
  faults.onProcess = undefined
})
async function drain(reader: AsyncGenerator<ArrivalEvent, StreamEnd>) {
  const events: ArrivalEvent[] = []
  while (true) {
    const next = await reader.next()
    if (next.done) return { events, end: next.value }
    events.push(next.value)
  }
}

describe('D095 actual credential path and single H', () => {
  it.each([false, true])('bind defect/rejected=%s has zero admission and HTTP', async rejected => {
    const host = await fixture(cert.tls, res => res.end(finish()))
    const events: string[] = []
    const agent = new Agent()
    let admissions = 0
    const resources: NetworkResources = {
      agent,
      baseUrl: new URL(host.options.baseUrl),
      tls: host.options.tls,
      policy: networkPolicy,
      active: new Set(),
      closed: () => false,
      diagnostic: event => events.push(event.kind),
      acquireConnection: async () => {
        admissions++
        return () => {}
      },
    }
    faults.stage = 'bind'
    faults.rejected = rejected
    try {
      const sent = await sendRequest(
        await planned(host.transport),
        'test-secret',
        new AbortController().signal,
        resources,
      )
      expect(sent).toEqual(
        rejected
          ? { rejected: 'invalidInput' }
          : { failed: { source: 'local', localError: 'bind_policy' } },
      )
      expect(admissions).toBe(0)
      expect(host.requests).toHaveLength(0)
      expect(writeJsonLossless(sent)).not.toContain('synthetic-secret-in-defect')
      if (!rejected) expect(events).toContain('model_transport.bind_policy_defect')
    } finally {
      agent.destroy()
      await host.close()
    }
  })

  it('retains an acquired empty H as distinct from optional absent H', async () => {
    const host = await fixture(
      cert.tls,
      res => {
        res.sendDate = false
        res.end(finish())
      },
      {
        credentialRedaction: {
          ...openRouterCredentialRedactionConfig,
          credential_header_names: [
            'connection',
            'content-length',
            'transfer-encoding',
            'keep-alive',
          ],
        },
      },
    )
    try {
      const plan = await planned(host.transport),
        sent = await host.transport.send(plan, 'test-secret', new AbortController().signal)
      if (!('response' in sent)) throw new Error('missing response')
      expect(sent).toHaveProperty('rawHeaders')
      expect(sent.rawHeaders).toEqual({})
      expect(Object.isFrozen(sent.rawHeaders)).toBe(true)
      await drain(host.transport.read(sent.response, plan, new AbortController().signal))
    } finally {
      await host.close()
    }
  })

  it('explicit cancel wins while a post-H body processor defect is being handled', async () => {
    const controller = new AbortController()
    const host = await fixture(cert.tls, res => {
      res.writeHead(503, { 'x-fact': 'kept' })
      res.end('{"error":{"unsafe":"original"}}')
    })
    faults.stage = 'json'
    faults.onProcess = () => controller.abort()
    try {
      const sent = await host.transport.send(
        await planned(host.transport),
        'test-secret',
        controller.signal,
      )
      expect(sent).toMatchObject({ aborted: true, rawHeaders: { 'x-fact': 'kept' } })
      expect(sent).not.toHaveProperty('failed')
      expect(writeJsonLossless(sent)).not.toContain('original')
    } finally {
      await host.close()
    }
  })

  it.each(['503', 'true', 'null'])(
    'cleans every scalar/key for %s while retaining actual HTTP status',
    async credential => {
      const scalar = JSON.parse(credential)
      const host = await fixture(cert.tls, res => {
        res.writeHead(503, { 'x-echo': credential, 'x-request-fact': 'request-1' })
        res.end(
          JSON.stringify({
            error: { [credential]: scalar, code: scalar, nested: [scalar], ordinary: 'safe' },
          }),
        )
      })
      try {
        const sent = await host.transport.send(
          await planned(host.transport),
          credential,
          new AbortController().signal,
        )
        expect(sent).toMatchObject({
          failed: { source: 'http_status', statusCode: 503 },
          rawHeaders: { 'x-request-fact': 'request-1' },
        })
        if (!('failed' in sent)) throw new Error('expected HTTP failure')
        expect(sent.failed).not.toHaveProperty('headers')
        const raw = writeJsonLossless(sent.failed.upstreamError?.raw)
        expect(raw).not.toContain(credential)
        expect(raw).toContain('safe')
        expect(raw).toContain('█')
        expect(sent.rawHeaders?.['x-echo']).toBe('█')
      } finally {
        await host.close()
      }
    },
  )

  it('preserves independent in-band code, usage/cost, and every invocation outcome H', async () => {
    for (const mode of ['complete', 'max_tokens', 'failed', 'aborted'] as const) {
      const controller = new AbortController()
      let gateEntered = false,
        gateDone = () => {}
      const gate = new Promise<void>(done => {
        gateDone = done
      })
      const host = await fixture(cert.tls, res => {
        res.writeHead(200, { 'x-request-fact': mode, 'x-echo': '503' })
        if (mode === 'failed') res.end(sse({ error: { code: 503, arbitrary: 503, '503': true } }))
        else if (mode === 'aborted') {
          res.write(content('pending'))
        } else
          res.end(
            content('business 503') +
              sse({
                usage: {
                  prompt_tokens: 503,
                  prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
                  completion_tokens: 1,
                  cost: 503,
                },
              }) +
              finish(mode === 'max_tokens' ? 'length' : 'stop'),
          )
      })
      try {
        const handle = invokeModel({
          ...input(),
          transport: host.transport,
          credential: '503',
          signal: controller.signal,
          policy: policy(),
          ...(mode === 'aborted'
            ? {
                beforeFirstContent: async () => {
                  gateEntered = true
                  await gate
                },
              }
            : {}),
        })
        if (mode === 'aborted') {
          await expect.poll(() => gateEntered).toBe(true)
          controller.abort()
          gateDone()
        }
        const result = invocation(await handle.outcome)
        expect(result.outcome).toBe(
          mode === 'max_tokens' ? 'truncated' : mode === 'aborted' ? 'interrupted' : mode,
        )
        expect(result.rawHeaders?.['x-request-fact']).toBe(mode)
        expect(result.rawHeaders?.['x-echo']).toBe('█')
        if (mode === 'failed') {
          expect(result.failure).toMatchObject({ statusCode: 503, inBand: true })
          expect(writeJsonLossless(result.failure?.upstreamError?.raw)).not.toContain('503')
        } else if (mode !== 'aborted') {
          expect(writeJsonLossless(result.usage)).toContain('503')
          expect(writeJsonLossless(result.cost)).toContain('503')
          expect(writeJsonLossless(result.blocks)).toContain('business 503')
        }
      } finally {
        await host.close()
      }
    }
  })

  it.each(['gate', 'protocol', 'broken'] as const)(
    'retains H through actual %s failure without placing it in arrivals or diagnostics',
    async mode => {
      const diagnostics: unknown[] = [],
        arrivals: ArrivalEvent[] = []
      const host = await fixture(
        cert.tls,
        res => {
          res.writeHead(200, { 'x-private-fact': 'kept' })
          if (mode === 'protocol') res.end('data: {malformed}\n\n')
          else if (mode === 'broken') res.end(content('partial'))
          else res.write(content('gated'))
        },
        {},
        event => diagnostics.push(event),
      )
      try {
        const handle = invokeModel({
          ...input(),
          transport: host.transport,
          credential: 'test-secret',
          signal: new AbortController().signal,
          policy: { ...policy(), diagnostic: event => diagnostics.push(event) },
          onAccepted: event => arrivals.push(event),
          ...(mode === 'gate'
            ? {
                beforeFirstContent: async () => {
                  throw new Error('private gate exception')
                },
              }
            : {}),
        })
        const result = invocation(await handle.outcome)
        expect(result.outcome).toBe('failed')
        expect(result.rawHeaders?.['x-private-fact']).toBe('kept')
        expect(writeJsonLossless(arrivals)).not.toContain('x-private-fact')
        expect(JSON.stringify(diagnostics)).not.toContain('x-private-fact')
        expect(writeJsonLossless(result)).not.toContain('private gate exception')
        if (mode === 'gate') await expect.poll(host.closedSockets).toBe(1)
      } finally {
        await host.close()
      }
    },
  )

  it('keeps ordered duplicate and empty array values with an explicit generic config', async () => {
    // Generic construction is deliberately not a production configuration approval.
    const host = await fixture(
      cert.tls,
      res => {
        res.writeHead(200, { 'set-cookie': ['a=1', '', 'a=1', ' b=2 '] })
        res.end(finish())
      },
      {
        credentialRedaction: {
          ...openRouterCredentialRedactionConfig,
          credential_header_names: [],
        },
      },
    )
    try {
      const plan = await planned(host.transport)
      const sent = await host.transport.send(plan, 'test-secret', new AbortController().signal)
      if (!('response' in sent)) throw new Error('missing response')
      // Node trims outer header whitespace; this oracle compares its actual map, not raw line order.
      expect(sent.rawHeaders?.['set-cookie']).toEqual(['a=1', '', 'a=1', 'b=2'])
      expect(Object.isFrozen(sent.rawHeaders)).toBe(true)
      expect(Object.isFrozen(sent.rawHeaders?.['set-cookie'])).toBe(true)
      const h = sent.rawHeaders
      await drain(host.transport.read(sent.response, plan, new AbortController().signal))
      expect(sent.rawHeaders).toBe(h)
    } finally {
      await host.close()
    }
  })

  it('rejects missing/illegal factory and plugin configuration without creating a service', async () => {
    const incomplete = { ...networkPolicy }
    Object.defineProperty(incomplete, 'credentialRedaction', { value: undefined })
    expect(() =>
      createPiAiTransport({
        imagePreparation,
        policy: incomplete,
        definitions: testDefinitions,
        inputMeters: [],
      }),
    ).toThrow()
    expect(() =>
      createPiAiTransport({
        imagePreparation,
        policy: {
          ...networkPolicy,
          credentialRedaction: {
            ...openRouterCredentialRedactionConfig,
            credential_fragment_min_length: 0,
          },
        },
        definitions: testDefinitions,
        inputMeters: [],
      }),
    ).toThrow()
    const retirement = { waitMilliseconds: 1, force: false, schedule: () => () => {} }
    const config = piAiTransportPlugin.Config
    if (!config) throw new Error('missing public plugin configuration')
    const valid = await config['~standard'].validate({ policy: networkPolicy, retirement })
    const invalid = await config['~standard'].validate({ policy: incomplete, retirement })
    expect(valid.issues).toBeUndefined()
    expect(invalid.issues?.length).toBeGreaterThan(0)
  })

  it('owns complete factory configuration before its source can change', async () => {
    const names = [...openRouterCredentialRedactionConfig.credential_header_names]
    const patterns = [...openRouterCredentialRedactionConfig.credential_patterns]
    const config = {
      ...openRouterCredentialRedactionConfig,
      credential_header_names: names,
      credential_patterns: patterns,
    }
    const host = await fixture(
      cert.tls,
      res => {
        res.writeHead(503, { 'x-api-key': 'upstream-key', 'x-pattern': 'sk-upstream' })
        res.end('{"error":{"pattern":"sk-upstream"}}')
      },
      { credentialRedaction: config },
    )
    try {
      names.length = 0
      patterns.length = 0
      config.credential_fragment_min_length = 99
      const sent = await host.transport.send(
        await planned(host.transport),
        'test-secret',
        new AbortController().signal,
      )
      if (!('failed' in sent)) throw new Error('missing HTTP failure')
      expect(sent.rawHeaders).not.toHaveProperty('x-api-key')
      expect(sent.rawHeaders?.['x-pattern']).toBe('█')
      expect(writeJsonLossless(sent)).not.toContain('sk-upstream')
    } finally {
      await host.close()
    }
  })

  it('binds direct-send config before its connection queue and releases after the real callback stops', async () => {
    const host = await fixture(cert.tls, res => {
      res.writeHead(503, { 'x-echo': 'abcdefgh' })
      res.end('{"error":{"message":"abcdefgh"}}')
    })
    const config = { ...openRouterCredentialRedactionConfig, credential_fragment_min_length: 8 }
    let resume = () => {},
      released = false,
      acquired = 0
    const queue = new Promise<void>(done => {
      resume = done
    })
    const agent = new Agent({ keepAlive: true })
    const resources: NetworkResources = {
      agent,
      baseUrl: new URL(host.options.baseUrl),
      tls: host.options.tls,
      policy: { ...networkPolicy, credentialRedaction: config },
      active: new Set(),
      closed: () => false,
      diagnostic: () => {},
      acquireConnection: async () => {
        acquired++
        await queue
        return () => {
          released = true
        }
      },
    }
    try {
      const invalid = { ...resources, policy: { ...resources.policy } }
      Object.defineProperty(invalid.policy, 'credentialRedaction', { value: undefined })
      expect(
        await sendRequest(
          await planned(host.transport),
          'abcdefghZZ',
          new AbortController().signal,
          invalid,
        ),
      ).toEqual({ rejected: 'invalidInput' })
      expect(acquired).toBe(0)
      const sending = sendRequest(
        await planned(host.transport),
        'abcdefghZZ',
        new AbortController().signal,
        resources,
      )
      expect(acquired).toBe(1)
      config.credential_fragment_min_length = 99
      resume()
      const sent = await sending
      expect(sent).toMatchObject({ rawHeaders: { 'x-echo': '█' } })
      expect(writeJsonLossless(sent)).not.toContain('abcdefgh')
      expect(released).toBe(true)
      expect(resources.active.size).toBe(0)
    } finally {
      resume()
      agent.destroy()
      await host.close()
    }
  })

  it.each([false, true])(
    'keeps HTTP H/source after body processor defect/rejected=%s',
    async rejected => {
      const kinds: string[] = []
      const host = await fixture(
        cert.tls,
        res => {
          res.writeHead(503, { 'x-fact': 'kept', connection: 'close' })
          res.end('{"error":{"secret":"unsafe"}}')
        },
        {},
        event => kinds.push(event.kind),
      )
      faults.stage = 'json'
      faults.rejected = rejected
      try {
        const sent = await host.transport.send(
          await planned(host.transport),
          'test-secret',
          new AbortController().signal,
        )
        expect(sent).toMatchObject({
          rawHeaders: { 'x-fact': 'kept' },
          failed: { source: 'http_status', statusCode: 503, localError: 'error_body_policy' },
        })
        expect(sent).not.toHaveProperty('failed.upstreamError')
        expect(writeJsonLossless(sent)).not.toContain('unsafe')
        expect(writeJsonLossless(sent)).not.toContain('synthetic-secret-in-defect')
        expect(kinds).toContain(
          `model_transport.error_body_policy_${rejected ? 'rejected' : 'defect'}`,
        )
        await expect.poll(host.closedSockets).toBe(1)
      } finally {
        await host.close()
      }
    },
  )

  it.each([false, true])(
    'keeps in-band H/code when required json processing fails=%s',
    async rejected => {
      const host = await fixture(cert.tls, res => {
        res.writeHead(200, { 'x-fact': 'kept' })
        res.end(sse({ error: { code: 503, unsafe: 'payload' } }))
      })
      try {
        const plan = await planned(host.transport)
        const sent = await host.transport.send(plan, 'test-secret', new AbortController().signal)
        if (!('response' in sent)) throw new Error('missing response')
        faults.stage = 'json'
        faults.rejected = rejected
        const result = await drain(
          host.transport.read(sent.response, plan, new AbortController().signal),
        )
        expect(result.end).toMatchObject({
          failed: {
            source: 'in_band',
            statusCode: 503,
            inBand: true,
            localError: 'in_band_error_policy',
          },
        })
        expect(result.end).not.toHaveProperty('failed.upstreamError')
        expect(sent.rawHeaders?.['x-fact']).toBe('kept')
        await sent.response.stopped
        await expect.poll(host.closedSockets).toBe(1)
      } finally {
        await host.close()
      }
    },
  )

  it.each([false, true])(
    'stops locally on required serving text failure=%s without changing reply fragments',
    async rejected => {
      const host = await fixture(cert.tls, res => {
        res.writeHead(200, { 'x-fact': 'kept' })
        res.end(content('business-secret') + sse({ model: 'untrusted-secret' }) + finish())
      })
      try {
        const plan = await planned(host.transport),
          sent = await host.transport.send(plan, 'test-secret', new AbortController().signal)
        if (!('response' in sent)) throw new Error('missing response')
        faults.stage = 'text'
        faults.rejected = rejected
        const result = await drain(
          host.transport.read(sent.response, plan, new AbortController().signal),
        )
        expect(result.end).toMatchObject({
          failed: { source: 'local', localError: 'serving_text_policy' },
        })
        expect(result.events).toContainEqual(
          expect.objectContaining({ t: 'fill', payload: 'business-secret' }),
        )
        expect(result.end).not.toHaveProperty('upstreamModel')
        expect(sent.rawHeaders?.['x-fact']).toBe('kept')
        await expect.poll(host.closedSockets).toBe(1)
      } finally {
        await host.close()
      }
    },
  )

  it.each([200, 503])(
    'treats rejected/invalid H as a port failure, preserving independent status %i',
    async status => {
      const host = await fixture(cert.tls, res => {
        res.writeHead(status, { 'x-unsafe': 'original-secret' })
        res.flushHeaders()
      })
      faults.invalidHeaders = true
      try {
        const sent = await host.transport.send(
          await planned(host.transport),
          'test-secret',
          new AbortController().signal,
        )
        expect(sent).not.toHaveProperty('rawHeaders')
        expect(sent).toMatchObject({
          failed: {
            source: status === 503 ? 'http_status' : 'local',
            localError: 'headers_policy',
            ...(status === 503 ? { statusCode: 503 } : {}),
          },
        })
        expect(writeJsonLossless(sent)).not.toContain('original-secret')
        await expect.poll(host.closedSockets).toBe(1)
      } finally {
        await host.close()
      }
    },
  )

  it('allows only pre-handoff optional H retention defect to omit H without changing the actual outcome', async () => {
    const kinds: string[] = []
    const host = await fixture(
      cert.tls,
      res => res.end(content('safe') + finish()),
      {},
      event => kinds.push(event.kind),
    )
    faults.stage = 'headers'
    try {
      const plan = await planned(host.transport),
        sent = await host.transport.send(plan, 'test-secret', new AbortController().signal)
      expect(sent).not.toHaveProperty('rawHeaders')
      expect(sent).toHaveProperty('response')
      if (!('response' in sent)) throw new Error('optional H defect became a business failure')
      expect(
        (await drain(host.transport.read(sent.response, plan, new AbortController().signal))).end,
      ).toMatchObject({ ended: 'end' })
      expect(kinds).toContain('model_transport.headers_policy_defect')
    } finally {
      await host.close()
    }
  })

  it('preserves H/status through an actual non-2xx body disconnect and cancellation', async () => {
    for (const cancelled of [false, true]) {
      const controller = new AbortController()
      let interrupt = () => {}
      const host = await fixture(cert.tls, res => {
        res.writeHead(503, { 'x-fact': 'kept' })
        res.write('{"error":')
        interrupt = () => (cancelled ? controller.abort() : res.destroy())
      })
      try {
        const sending = host.transport.send(
          await planned(host.transport),
          'test-secret',
          controller.signal,
        )
        await expect.poll(() => host.requests.length).toBe(1)
        // Wait for response headers to reach the client before controlling the body window.
        await new Promise<void>(done => setTimeout(done, 20))
        interrupt()
        const sent = await sending
        if ('rejected' in sent) throw new Error('unexpected rejection')
        expect(sent.rawHeaders?.['x-fact']).toBe('kept')
        expect(sent).toMatchObject(
          cancelled
            ? { aborted: true }
            : { failed: { source: 'http_status', statusCode: 503, localError: 'error_body_read' } },
        )
        await expect.poll(host.closedSockets).toBe(1)
      } finally {
        await host.close()
      }
    }
  })
})
