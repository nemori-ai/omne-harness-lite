import { testDefinitions } from './definitions.ts'
import { planRequest } from './synthetic-input-meter.ts'
import { syntheticInputMeter } from './synthetic-input-meter.ts'
import { Agent } from 'node:https'
import type { ServerResponse } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Context, type Plugin } from '@deepseek-ai/cordis'
import { LosslessNumber, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { judgeAccountValue } from '@omne-harness-lite/call-accounts'
import {
  invokeModel,
  type StreamEnd,
  type TransportAdapter,
} from '@omne-harness-lite/model-request-runtime-local'
import type { ArrivalEvent } from '@omne-harness-lite/arrival-events'
import {
  createModelTransportService,
  readStream,
  sendRequest,
  type Diagnostic,
  type NetworkResources,
  type PlannedRequest,
  type RawResponse,
  type RetirementPolicy,
  type ModelTransportService,
} from '@omne-harness-lite/pi-ai-transport'
import {
  createModelPlugin,
  MODEL_TRANSPORT_SERVICE,
} from '@omne-harness-lite/pi-ai-transport/plugin'
import {
  certificate,
  networkPolicy,
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
function deferred() {
  let resolve = () => {}
  const promise = new Promise<void>(done => {
    resolve = done
  })
  return { promise, resolve }
}
function retirement(): RetirementPolicy {
  return {
    force: false,
    waitMilliseconds: 20,
    schedule(ms, callback) {
      const timer = setTimeout(callback, ms)
      return () => clearTimeout(timer)
    },
  }
}
async function drain(reader: AsyncGenerator<ArrivalEvent, StreamEnd>) {
  const events: ArrivalEvent[] = []
  while (true) {
    const next = await reader.next()
    if (next.done) return { events, end: next.value }
    events.push(next.value)
  }
}
async function promptly<T>(completion: Promise<T>): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      completion,
      new Promise<undefined>(resolve => {
        timer = setTimeout(() => resolve(undefined), 300)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

describe('host admission closes before references drain, with actual HTTPS', () => {
  it.each(['direct', 'cordis'] as const)(
    '%s closure rejects queued and old-lease sends but preserves an active reader and callback',
    async mode => {
      let response: ServerResponse | undefined
      let requests = 0
      const host = await fixture(
        cert.tls,
        res => {
          requests++
          if (requests > 1) {
            res.setHeader('connection', 'close')
            res.end(content('replacement') + finish())
            return
          }
          response = res
          res.writeHead(200, { 'content-type': 'text/event-stream', connection: 'close' })
          res.write(content('before-close'))
        },
        { maxConnections: 1 },
      )
      const service = createModelTransportService(host.options)
      const ctx = new Context()
      const callback = deferred()
      const cancel = new AbortController()
      let closure: Promise<unknown> | undefined
      let providerDisposed = false
      let replacementService: ModelTransportService | undefined
      let held: { release: () => void } | undefined
      let beginClosure: () => Promise<unknown> = () => {
        throw new Error('closure not configured')
      }
      try {
        const definition = testDefinitions[0]
        if (!definition) throw new Error('missing definition')
        if (mode === 'cordis') {
          const provider: Plugin.Object = {
            name: 'boundary-owned-https-provider',
            apply(context) {
              context.provide(MODEL_TRANSPORT_SERVICE, service)
              context.effect(() => async () => {
                await service.close(retirement())
                await service.closed
                providerDisposed = true
              })
            },
          }
          const fiber = ctx.plugin(provider)
          await fiber
          await ctx.plugin(
            createModelPlugin(definition, syntheticInputMeter(definition, 'openai'), retirement()),
            {},
          )
          closure = undefined
          const replacement: Plugin.Object = {
            name: 'boundary-replacement-provider',
            apply(context) {
              const value = createModelTransportService(host.options)
              replacementService = value
              context.provide(MODEL_TRANSPORT_SERVICE, value)
              context.effect(() => async () => {
                await value.close(retirement())
              })
            },
          }
          // The replacement is installed after the old provider has actually disposed.
          // Keep the provider handle without introducing any replacement semantics in production.
          beginClosure = () =>
            fiber.dispose().then(async () => {
              await ctx.plugin(replacement)
            })
        } else {
          const registered = service.registerAdaptation(
            definition,
            syntheticInputMeter(definition, 'openai'),
            {},
            () => {},
          )
          if ('rejected' in registered) throw new Error('registration rejected')
          beginClosure = () => service.close(retirement())
        }
        const request = input()
        const acquired = service.acquire(request.snapshot.adaptation, request.routeName)
        if ('rejected' in acquired) throw new Error('acquisition rejected')
        const lease = acquired.lease
        held = lease
        lease.track(callback.promise)
        const plan = await lease.transport.plan(request, { signal: new AbortController().signal })
        if ('rejected' in plan) throw new Error('plan rejected')
        const sent = await lease.transport.send(plan.planned, 'boundary-credential', cancel.signal)
        if (!('response' in sent)) throw new Error('response missing')
        const reading = drain(lease.transport.read(sent.response, plan.planned, cancel.signal))
        const queued = lease.transport.send(plan.planned, 'boundary-credential', cancel.signal)
        await new Promise<void>(resolve => setImmediate(resolve))
        closure = beginClosure()
        await expect.poll(() => service.inspect().accepting).toBe(false)
        const oldLeaseSend = lease.transport.send(
          plan.planned,
          'boundary-credential',
          cancel.signal,
        )
        expect(await promptly(queued)).toEqual({ rejected: 'unavailable' })
        expect(await promptly(oldLeaseSend)).toEqual({ rejected: 'unavailable' })
        expect(host.requests).toHaveLength(1)
        expect(host.closedSockets()).toBe(0)
        expect(lease.signal.aborted).toBe(false)
        if (!response) throw new Error('server response unavailable')
        response.end(content('-after-close') + finish())
        const read = await reading
        expect(read.end).toMatchObject({ ended: 'end' })
        expect(read.events.filter(event => event.t === 'fill').map(event => event.payload)).toEqual(
          ['before-close', '-after-close'],
        )
        await sent.response.stopped
        await expect.poll(host.closedSockets).toBe(1)
        expect(host.requests).toHaveLength(1)
        lease.release()
        expect(service.inspect().references).toBe(1)
        expect(providerDisposed).toBe(false)
        callback.resolve()
        await closure
        await service.closed
        expect(service.inspect()).toMatchObject({ registrations: 0, references: 0, executions: 0 })
        if (mode === 'cordis') expect(providerDisposed).toBe(true)
        if (replacementService) {
          const current = replacementService
          await expect.poll(() => current.inspect().registrations).toBe(1)
          const acquired = current.acquire(request.snapshot.adaptation, request.routeName)
          if ('rejected' in acquired) throw new Error('replacement acquisition rejected')
          const replacementLease = acquired.lease
          try {
            const plan = await replacementLease.transport.plan(request, {
              signal: new AbortController().signal,
            })
            if ('rejected' in plan) throw new Error('replacement plan rejected')
            const sent = await replacementLease.transport.send(
              plan.planned,
              'replacement-secret',
              cancel.signal,
            )
            if (!('response' in sent)) throw new Error('replacement response missing')
            const read = await drain(
              replacementLease.transport.read(sent.response, plan.planned, cancel.signal),
            )
            expect(read.end).toMatchObject({ ended: 'end' })
            expect(read.events.filter(event => event.t === 'fill')).toMatchObject([
              { payload: 'replacement' },
            ])
            expect(host.requests).toHaveLength(2)
            await expect.poll(host.closedSockets).toBe(2)
          } finally {
            replacementLease.release()
          }
        }
      } finally {
        cancel.abort()
        callback.resolve()
        held?.release()
        response?.end()
        await service.close(retirement())
        await service.closed
        if (closure) await closure
        await ctx.fiber.dispose()
        await host.close()
      }
    },
  )
})

const sentinel = 'Aq7"B\\cD9_abcdefghIjKlMnOpQ'
const minimum = 8
function clean(value: unknown, credential = sentinel) {
  const inspect = (item: unknown): void => {
    if (typeof item === 'string') {
      expect(item).not.toContain(credential)
      for (let i = 0; i <= credential.length - minimum; i++)
        expect(item).not.toContain(credential.slice(i, i + minimum))
    } else if (Array.isArray(item)) for (const entry of item) inspect(entry)
    else if (item && typeof item === 'object')
      for (const [key, entry] of Object.entries(item)) {
        inspect(key)
        inspect(entry)
      }
  }
  inspect(value)
}
describe('credentials cannot return through upstream non-content facts', () => {
  it.each(['before', 'after'] as const)(
    'preserves ordinary and multiple redacted keys when an existing marker key appears %s',
    async order => {
      const ordinary: [string, unknown] = ['█', 'ordinary-preserved']
      const secretKeys: [string, unknown][] = [
        [sentinel, 'first-preserved'],
        ['abcdefgh', 'second-preserved'],
      ]
      const error = Object.fromEntries(
        order === 'before' ? [ordinary, ...secretKeys] : [...secretKeys, ordinary],
      )
      const host = await fixture(cert.tls, res => {
        res.setHeader('connection', 'close')
        res.end(sse({ error }))
      })
      try {
        const plan = await planned(host.transport)
        const sent = await host.transport.send(plan, sentinel, new AbortController().signal)
        if (!('response' in sent)) throw new Error('response missing')
        const result = await drain(
          host.transport.read(sent.response, plan, new AbortController().signal),
        )
        clean(result.end)
        expect(result.end).toMatchObject({
          failed: { upstreamError: { raw: { '█': 'ordinary-preserved' } } },
        })
        const serialized = writeJsonLossless(result.end)
        expect(serialized).toContain('first-preserved')
        expect(serialized).toContain('second-preserved')
      } finally {
        await host.close()
      }
    },
  )
  it.each(['redacted', '[redacted]', 'AA[redacted]ZZ'] as const)(
    'redaction does not recreate a credential within its replacement marker',
    async credential => {
      const host = await fixture(cert.tls, res => {
        res.setHeader('connection', 'close')
        res.end(
          sse({
            error: {
              message: `ordinary-before-${credential}-ordinary-after`,
              repeated: credential,
            },
          }),
        )
      })
      try {
        const plan = await planned(host.transport)
        const sent = await host.transport.send(plan, credential, new AbortController().signal)
        if (!('response' in sent)) throw new Error('response missing')
        const result = await drain(
          host.transport.read(sent.response, plan, new AbortController().signal),
        )
        clean(result.end, credential)
        expect(writeJsonLossless(result.end)).toContain('ordinary-before-')
        expect(writeJsonLossless(result.end)).toContain('-ordinary-after')
      } finally {
        await host.close()
      }
    },
  )
  it.each(['http', 'in-band', 'finish', 'serving'] as const)(
    'redacts escaped sentinel in %s values while preserving ordinary lossless facts',
    async kind => {
      const diagnostics: Diagnostic[] = []
      const host = await fixture(
        cert.tls,
        res => {
          if (kind === 'http') {
            res.writeHead(429, {
              'x-abcdefgh': sentinel,
              'x-values': [sentinel, 'ordinary'],
              connection: 'close',
            })
            res.end(
              writeJsonLossless({
                error: {
                  message: sentinel,
                  [sentinel]: ['ordinary', sentinel],
                  exact: 9007199254740993n.toString(),
                  precise: new LosslessNumber('0.000000000000000123456789'),
                },
              }),
            )
          } else {
            res.writeHead(200, { 'content-type': 'text/event-stream', connection: 'close' })
            if (kind === 'in-band')
              res.end(
                sse({
                  error: {
                    message: sentinel,
                    nested: { [sentinel]: [sentinel, 'retained'] },
                    code: 429,
                    ordinary: 'retained',
                    precise: new LosslessNumber('0.000000000000000123456789'),
                  },
                }),
              )
            else if (kind === 'finish')
              res.end(sse({ choices: [{ delta: {}, finish_reason: sentinel }] }))
            else
              res.end(
                sse({
                  id: sentinel,
                  model: sentinel,
                  provider: sentinel,
                  choices: [{ delta: { content: 'ordinary' } }],
                }) +
                  sse(
                    '{"choices":[],"usage":{"prompt_tokens":100,"completion_tokens":3,"prompt_tokens_details":{"cached_tokens":20,"cache_write_tokens":0},"cost":0.000000000000000123456789}}',
                  ) +
                  finish(),
              )
          }
        },
        {
          credentialRedaction: {
            ...networkPolicy.credentialRedaction,
            credential_fragment_min_length: minimum,
          },
        },
        event => diagnostics.push(event),
      )
      try {
        const request = await planned(host.transport)
        const sent = await host.transport.send(request, sentinel, new AbortController().signal)
        if ('response' in sent) {
          // H is separate from the opaque body handle and already processed.
          clean(sent.rawHeaders)
          expect(Reflect.ownKeys(sent.response).sort()).toEqual(['stop', 'stopped'])
          const result = await drain(
            host.transport.read(sent.response, request, new AbortController().signal),
          )
          clean(result.end)
          if (kind === 'in-band') {
            expect(result.end).toMatchObject({
              failed: { source: 'in_band', upstreamError: { raw: { ordinary: 'retained' } } },
            })
            expect(writeJsonLossless(result.end)).toContain('0.000000000000000123456789')
          }
          if (kind === 'serving') {
            expect(result.events.filter(event => event.t === 'fill')).toMatchObject([
              { payload: 'ordinary' },
            ])
            expect(writeJsonLossless(result.events)).toContain('0.000000000000000123456789')
          }
        } else {
          clean(sent)
          expect(sent).toMatchObject({
            failed: {
              statusCode: 429,
              upstreamError: { raw: { error: { exact: '9007199254740993' } } },
            },
          })
          expect(writeJsonLossless(sent)).toContain('0.000000000000000123456789')
          expect(writeJsonLossless(sent)).toContain('ordinary')
        }
        const handle = invokeModel({
          ...input(),
          transport: host.transport,
          credential: sentinel,
          signal: new AbortController().signal,
          policy: policy(),
        })
        const result = invocation(await handle.outcome)
        clean(result)
        clean(diagnostics)
        if (kind === 'serving') {
          expect(result.outcome).toBe('complete')
          expect(result.blocks).toMatchObject([{ text: 'ordinary' }])
          expect(writeJsonLossless(result.cost)).toContain('0.000000000000000123456789')
          expect(result.usage).toHaveProperty('source', 'upstream')
        }
        expect(host.requests).toHaveLength(2)
        await expect.poll(host.closedSockets).toBe(2)
      } finally {
        await host.close()
      }
    },
  )
})

describe('direct public send/read diagnostics do not control business', () => {
  it.each([
    'baseline',
    'throw',
    'reject',
    'pending',
    'throw_read',
    'reject_read',
    'pending_read',
  ] as const)(
    'isolates %s sink through direct functions and invokeModel with actual resources',
    async mode => {
      const waiting = deferred()
      const host = await fixture(cert.tls, res => {
        res.setHeader('connection', 'close')
        res.end(
          content('unchanged') +
            sse({ choices: [], usage: {} }) +
            sse(
              '{"choices":[],"usage":{"prompt_tokens":100,"completion_tokens":3,"prompt_tokens_details":{"cached_tokens":20,"cache_write_tokens":0},"cost":0.000000000000000123456789}}',
            ) +
            finish(),
        )
      })
      const agent = new Agent({ keepAlive: true })
      const active = new Set<Promise<void>>()
      const diagnostics: Diagnostic[] = []
      const resources: NetworkResources = {
        agent,
        active,
        baseUrl: new URL(host.options.baseUrl),
        tls: host.options.tls,
        policy: host.options.policy,
        closed: () => false,
        acquireConnection: async () => () => {},
        diagnostic(event) {
          diagnostics.push(event)
          if (mode.endsWith('_read') && event.kind === 'model_transport.send_started') return
          if (mode.startsWith('throw')) throw new Error('diagnostic only')
          if (mode.startsWith('reject')) return Promise.reject(new Error('diagnostic only'))
          if (mode.startsWith('pending')) return waiting.promise
        },
      }
      const adapter: TransportAdapter<PlannedRequest, RawResponse> = {
        plan: host.transport.plan,
        projectOutput: host.transport.projectOutput,
        send: (plan, credential, signal) => sendRequest(plan, credential, signal, resources),
        read: (response, plan, signal) =>
          readStream(response, plan, signal, {
            maxSseEventBytes: resources.policy.maxSseEventBytes,
            diagnostic: resources.diagnostic,
          }),
      }
      try {
        const plan = await planned(host.transport)
        const sent = await sendRequest(
          plan,
          'direct-secret',
          new AbortController().signal,
          resources,
        )
        if (!('response' in sent)) throw new Error('direct send failed')
        const result = await drain(
          readStream(sent.response, plan, new AbortController().signal, {
            maxSseEventBytes: resources.policy.maxSseEventBytes,
            diagnostic: resources.diagnostic,
          }),
        )
        expect(result.end).toMatchObject({ ended: 'end' })
        expect(result.events.filter(event => event.t === 'fill')).toMatchObject([
          { payload: 'unchanged' },
        ])
        expect(writeJsonLossless(result.events)).toContain('0.000000000000000123456789')
        const handle = invokeModel({
          ...input(),
          transport: adapter,
          credential: 'direct-secret',
          signal: new AbortController().signal,
          policy: policy(),
        })
        const invoked = invocation(await handle.outcome)
        expect(invoked.outcome).toBe('complete')
        expect(invoked.blocks).toMatchObject([{ text: 'unchanged' }])
        expect(writeJsonLossless(invoked.cost)).toContain('0.000000000000000123456789')
        expect(
          diagnostics.filter(event => event.kind === 'model_transport.send_started'),
        ).toHaveLength(2)
        expect(
          diagnostics.filter(event => event.kind === 'model_transport.usage_repeated'),
        ).toHaveLength(2)
        expect(active.size).toBe(0)
        expect(host.requests).toHaveLength(2)
        await expect.poll(host.closedSockets).toBe(2)
      } finally {
        waiting.resolve()
        agent.destroy()
        await Promise.all([...active])
        await host.close()
      }
    },
  )
})

describe('factory diagnostic counters retain their declared meaning', () => {
  it.each(['baseline', 'throw', 'reject', 'pending'] as const)(
    '%s reports health without changing the model result',
    async mode => {
      const waiting = deferred()
      const host = await fixture(
        cert.tls,
        res => {
          res.setHeader('connection', 'close')
          res.end(
            content('same') +
              sse(
                '{"choices":[],"usage":{"prompt_tokens":100,"completion_tokens":3,"prompt_tokens_details":{"cached_tokens":20,"cache_write_tokens":0},"cost":0.000000000000000123456789}}',
              ) +
              sse({ choices: [], usage: {} }) +
              finish(),
          )
        },
        { maxConnections: 1 },
        () => {
          if (mode === 'throw') throw new Error('factory diagnostic')
          if (mode === 'reject') return Promise.reject(new Error('factory diagnostic'))
          if (mode === 'pending') return waiting.promise
        },
      )
      try {
        const result = invocation(
          await invokeModel({
            ...input(),
            transport: host.transport,
            credential: 'factory-secret',
            signal: new AbortController().signal,
            policy: policy(),
          }).outcome,
        )
        expect(result.outcome).toBe('complete')
        expect(result.blocks).toMatchObject([{ text: 'same' }])
        await expect
          .poll(() => host.transport.diagnostics())
          .toEqual(
            mode === 'pending'
              ? { failed: 0, pending: 1, dropped: 1 }
              : { failed: mode === 'baseline' ? 0 : 2, pending: 0, dropped: 0 },
          )
        await host.transport.close()
        await expect.poll(host.closedSockets).toBe(1)
        waiting.resolve()
        await expect.poll(() => host.transport.diagnostics().pending).toBe(0)
      } finally {
        waiting.resolve()
        await host.close()
      }
    },
  )
})

it('records dropped extra parameter names exactly as profile v3 S-20 requires', async () => {
  const result = await planRequest(
    {
      ...input(),
      parameters: { reasoningEffort: 'max', extra: { model: 'override', max_tokens: 2 } },
    },
    testDefinitions,
  )
  if ('rejected' in result) throw new Error('plan rejected')
  expect(result.planned.droppedParameters).toEqual(['reasoningEffort', 'max_tokens', 'model'])
  expect(result.planned.parameters).not.toHaveProperty('extra')
})

describe('account source reflects actual known base token facts', () => {
  it.each([
    { name: 'empty', raw: {}, source: 'none' },
    {
      name: 'reasoning only',
      raw: { completion_tokens_details: { reasoning_tokens: 2 } },
      source: 'none',
    },
    {
      name: 'cost only',
      raw: { cost: new LosslessNumber('0.000000000000000123456789') },
      source: 'none',
    },
    {
      name: 'invalid base fields',
      raw: {
        prompt_tokens: -1,
        completion_tokens: 0.5,
        prompt_tokens_details: { cached_tokens: -1, cache_write_tokens: 'invalid' },
      },
      source: 'none',
    },
    {
      name: 'inconsistent subtraction',
      raw: { prompt_tokens: 1, prompt_tokens_details: { cached_tokens: 2, cache_write_tokens: 0 } },
      source: 'upstream',
    },
    { name: 'reported output zero', raw: { completion_tokens: 0 }, source: 'upstream' },
    {
      name: 'reported cached zero',
      raw: { prompt_tokens_details: { cached_tokens: 0 } },
      source: 'upstream',
    },
    {
      name: 'exact large count and independent cost',
      raw: {
        prompt_tokens: new LosslessNumber('9007199254740993'),
        completion_tokens: 7,
        completion_tokens_details: { reasoning_tokens: 2 },
        prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
        cost: new LosslessNumber('0.000000000000000123456789'),
      },
      source: 'upstream',
    },
  ] as const)(
    '$name has source $source and satisfies the public Usage judge',
    async ({ name, raw, source }) => {
      const host = await fixture(cert.tls, res => {
        res.setHeader('connection', 'close')
        res.end(content('ordinary') + sse({ choices: [], usage: raw }) + finish())
      })
      function assertUsage(value: unknown) {
        expect(judgeAccountValue('Usage', value)).toEqual({ ok: true })
        expect(value).toHaveProperty('source', source)
        if (source === 'none') {
          expect(value).toMatchObject({
            input_tokens: 'unknown',
            output_tokens: 'unknown',
            cache_read_tokens: 'unknown',
            cache_write_tokens: 'unknown',
          })
          expect(value).not.toHaveProperty('reasoning_tokens')
        }
        if (name === 'exact large count and independent cost') {
          expect(writeJsonLossless(value)).toContain('9007199254740993')
          expect(value).toHaveProperty('reasoning_tokens')
        }
      }
      try {
        const plan = await planned(host.transport)
        const sent = await host.transport.send(
          plan,
          'account-source-secret',
          new AbortController().signal,
        )
        if (!('response' in sent)) throw new Error('response missing')
        const direct = await drain(
          host.transport.read(sent.response, plan, new AbortController().signal),
        )
        const account = direct.events.find(event => event.t === 'account')
        if (!account || account.t !== 'account') throw new Error('account event missing')
        assertUsage(account.usage)
        const invoked = invocation(
          await invokeModel({
            ...input(),
            transport: host.transport,
            credential: 'account-source-secret',
            signal: new AbortController().signal,
            policy: policy(),
          }).outcome,
        )
        expect(invoked.outcome).toBe('complete')
        assertUsage(invoked.usage)
        if ('cost' in raw) {
          expect(writeJsonLossless(account.cost)).toContain('0.000000000000000123456789')
          expect(writeJsonLossless(invoked.cost)).toContain('0.000000000000000123456789')
        }
        expect(host.requests).toHaveLength(2)
        await expect.poll(host.closedSockets).toBe(2)
      } finally {
        await host.close()
      }
    },
  )
})
