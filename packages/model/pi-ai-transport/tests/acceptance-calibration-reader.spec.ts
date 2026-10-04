import { imagePreparation } from './image-transport-support.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {invokeModel} from '@omne-harness-lite/model-request-runtime-local'
import {type PlanInput} from '@omne-harness-lite/model-request-runtime'
import {
  anthropicDefinitions,
  createAnthropicInputMeter,
  createPiAiTransport,
  createOfficialProfileContent,
} from '../src/index.ts'
import { certificate, fixture, input, message, policy, content, sse, finish } from './support.ts'
let cert: ReturnType<typeof certificate>
beforeAll(() => {
  cert = certificate()
})
afterAll(() => cert.dispose())
const definition = anthropicDefinitions[0]!
function request(): PlanInput {
  const profile = createOfficialProfileContent(definition, {
    providers: ['anthropic'],
    allowFallback: false,
    configuration: {
      revision: 'reader-independent',
      values: { cache: { mode: 'explicit', ttl: '1h', breakpoints: ['last_message'] } },
    },
  })
  if ('rejected' in profile) throw Error(profile.rejected)
  return {
    ...input(),
    routeName: definition.modelId,
    provider: 'anthropic',
    parameters: { maxOutputTokens: 128 },
    snapshot: {
      ...input().snapshot,
      ...definition.capabilities,
      adaptation: profile.ok.adaptation,
      providers: ['anthropic'],
    },
    messages: [message('user', 'observe actual reader facts')],
  }
}
const cases = [
  {
    name: 'complete-disjoint-cache',
    usage: {
      prompt_tokens: 120,
      completion_tokens: 4,
      prompt_tokens_details: { cached_tokens: 60, cache_write_tokens: 20 },
    },
    observed: { kind: 'from_usage' },
  },
  {
    name: 'known-total-unknown-cache-write',
    usage: {
      prompt_tokens: 120,
      completion_tokens: 4,
      prompt_tokens_details: { cached_tokens: 60 },
    },
    observed: { kind: 'upstream_total', tokens: 120 },
  },
  {
    name: 'conflicting-parts',
    usage: {
      prompt_tokens: 10,
      completion_tokens: 4,
      prompt_tokens_details: { cached_tokens: 60, cache_write_tokens: 20 },
    },
    observed: { kind: 'unavailable', reason: 'inconsistent_usage' },
  },
  {
    name: 'known-zero',
    usage: {
      prompt_tokens: 0,
      completion_tokens: 4,
      prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
    },
    observed: { kind: 'from_usage' },
  },
  {
    name: 'response-cache-zero',
    usage: {
      prompt_tokens: 0,
      completion_tokens: 4,
      prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
    },
    observed: { kind: 'unavailable', reason: 'response_cache' },
  },
  {
    name: 'billing-total-only',
    usage: { total_tokens: 120, completion_tokens: 4 },
    observed: { kind: 'unavailable', reason: 'scope_unknown' },
  },
  {
    name: 'no-usage',
    usage: undefined,
    observed: { kind: 'unavailable', reason: 'missing_usage' },
  },
] as const

describe('independent real TLS reader-to-public-invoke calibration', () => {
  for (const entry of cases)
    it(entry.name, async () => {
      const host = await fixture(
        cert.tls,
        response => {
          response.writeHead(200, {
            'content-type': 'text/event-stream',
            ...(entry.name === 'response-cache-zero' ? { 'X-OpenRouter-Cache-Status': 'HIT' } : {}),
          })
          response.end(
            content('original reply') +
              sse({
                choices: [],
                model: definition.modelId,
                provider: 'Anthropic',
                ...(entry.usage === undefined ? {} : { usage: entry.usage }),
              }) +
              finish(),
          )
        },
        {},
        undefined,
        [definition],
      )
      const transport = createPiAiTransport({
        ...host.options,
        definitions: [definition],
        inputMeters: [createAnthropicInputMeter(definition)],
      })
      try {
        const handle = invokeModel({
          ...(await request()),
          transport,
          credential: 'controlled-reader-key',
          signal: new AbortController().signal,
          policy: policy(),
          onAccepted() {},
        })
        const result = await handle.outcome
        if (!('outcome' in result)) throw Error(JSON.stringify(result))
        expect(result.outcome).toBe('complete')
        expect(result.inputCalibration.observedInput).toMatchObject(entry.observed)
        expect(handle.observedFacts()).toMatchObject({
          facts: { inputCalibration: result.inputCalibration, usage: result.usage },
        })
        expect(result.inputCalibration.outputGroup).toMatchObject({
          kind: 'known',
          completeness: 'complete',
          source: 'reply',
        })
        if (entry.name === 'known-total-unknown-cache-write')
          expect(result.usage).toMatchObject({
            input_tokens: 'unknown',
            cache_read_tokens: 60,
            cache_write_tokens: 'unknown',
          })
        if (entry.name === 'conflicting-parts')
          expect(result.usage).toMatchObject({
            input_tokens: 'unknown',
            cache_read_tokens: 60,
            cache_write_tokens: 20,
          })
        if (entry.name === 'no-usage') expect(result.usage.source).toBe('none')
        expect(host.requests).toHaveLength(1)
      } finally {
        await transport.close()
        await host.close()
      }
    })
  for (const ending of [
    'abort-before-usage',
    'abort-after-usage',
    'invalid-frame',
    'in-band-error',
    'connection-break',
  ] as const)
    it(`retains only already-observed facts on ${ending} and awaits actual read stop`, async () => {
      const controller = new AbortController()
      const usage = sse({
        choices: [],
        model: definition.modelId,
        provider: 'Anthropic',
        usage: {
          prompt_tokens: 123,
          completion_tokens: 4,
          prompt_tokens_details: { cached_tokens: 10 },
        },
      })
      const host = await fixture(
        cert.tls,
        async response => {
          response.writeHead(200, { 'content-type': 'text/event-stream' })
          if (ending === 'abort-before-usage') response.write(content('partial'))
          else if (ending === 'abort-after-usage') response.write(usage + content('partial'))
          else if (ending === 'invalid-frame')
            response.end(usage + content('partial') + 'data: {invalid}\n\n')
          else if (ending === 'in-band-error')
            response.end(
              usage + sse({ error: { code: 503, message: 'controlled provider interruption' } }),
            )
          else {
            response.write(usage + content('partial'))
            await new Promise(resolve => setTimeout(resolve, 20))
            response.destroy()
          }
        },
        {},
        undefined,
        [definition],
      )
      const transport = createPiAiTransport({
        ...host.options,
        definitions: [definition],
        inputMeters: [createAnthropicInputMeter(definition)],
      })
      const stopped: Promise<void>[] = []
      const wrapped = {
        ...transport,
        async send(...args: Parameters<typeof transport.send>) {
          const result = await transport.send(...args)
          if ('response' in result) stopped.push(result.response.stopped)
          return result
        },
      }
      try {
        const outcome = await invokeModel({
          ...(await request()),
          transport: wrapped,
          credential: 'controlled-stop-key',
          signal: controller.signal,
          policy: policy(),
          onAccepted() {
            if (ending.startsWith('abort-')) controller.abort()
          },
        }).outcome
        if (!('outcome' in outcome)) throw Error(JSON.stringify(outcome))
        expect(outcome.inputCalibration.observedInput).toMatchObject(
          ending === 'abort-before-usage'
            ? { kind: 'unavailable', reason: 'missing_usage' }
            : { kind: 'upstream_total', tokens: 123 },
        )
        expect(outcome.outcome).not.toBe('complete')
        expect(stopped).toHaveLength(1)
        await Promise.all(stopped)
        expect(host.requests).toHaveLength(1)
      } finally {
        controller.abort()
        await transport.close()
        await host.close()
      }
    })
  it('assembly rejection still obtains the actual stopped reader final facts without waiting for future usage', async () => {
    const host = await fixture(
      cert.tls,
      response => {
        response.writeHead(200, { 'content-type': 'text/event-stream' })
        response.write(
          sse({
            choices: [],
            model: definition.modelId,
            provider: 'Anthropic',
            usage: { prompt_tokens: 123, completion_tokens: 4 },
          }) + content('not-yet-complete'),
        )
        // Never EOF: only the consumer rejection can stop this actual response.
      },
      {},
      undefined,
      [definition],
    )
    const transport = createPiAiTransport({
      ...host.options,
      definitions: [definition],
      inputMeters: [createAnthropicInputMeter(definition)],
    })
    let terminals = 0,
      duplicate = false
    const stopped: Promise<void>[] = []
    const wrapped = {
      ...transport,
      async send(...args: Parameters<typeof transport.send>) {
        const sent = await transport.send(...args)
        if ('response' in sent) stopped.push(sent.response.stopped)
        return sent
      },
      async *read(...args: Parameters<typeof transport.read>) {
        const actual = transport.read(...args)
        while (true) {
          const next = await actual.next()
          if (next.done) {
            terminals++
            return next.value
          }
          yield next.value
          // A controlled adapter protocol violation drives the real stream-assembly admission
          // guard. Statistics and actual stop still come from the production TLS reader.
          if (!duplicate && next.value.t === 'open') {
            duplicate = true
            yield next.value
          }
        }
      },
    }
    try {
      const result = await invokeModel({
        ...(await request()),
        transport: wrapped,
        credential: 'controlled-assembly-key',
        signal: new AbortController().signal,
        policy: policy(),
        onAccepted() {},
      }).outcome
      if (!('outcome' in result)) throw Error(JSON.stringify(result))
      expect(duplicate).toBe(true)
      expect(result.outcome).not.toBe('complete')
      expect(result.inputCalibration.observedInput).toMatchObject({
        kind: 'upstream_total',
        tokens: 123,
      })
      expect(terminals).toBe(1)
      expect(stopped).toHaveLength(1)
      await Promise.all(stopped)
      expect(host.requests).toHaveLength(1)
    } finally {
      await transport.close()
      await host.close()
    }
  })
})
