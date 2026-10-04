import { imagePreparation } from './image-transport-support.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { LosslessNumber, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { invokeModel, type PlanInput } from '@omne-harness-lite/model-request-runtime-local'
import { createReadFactsAccumulator } from '../src/read-facts.ts'
import { usageScope, PRO_READER_REVISION } from '../src/usage-scope.ts'
import { openaiDefinitions, openaiConfiguration } from '../src/official-models/openai.ts'
import { openAiFamilyRecords } from '../src/input-meters/openai-family-policy.ts'
import { createOpenAiInputMeter } from '../src/input-meters/openai.ts'
import { createOfficialProfileContent } from '../src/configuration.ts'
import { createPiAiTransport } from '../src/transport.ts'
import { createModelTransportService, type RetirementPolicy } from '../src/registry.ts'
import type { ModelDefinition } from '../src/definitions.ts'
import { certificate, fixture, input, message, policy, sse, finish } from './support.ts'

function request(definition: ModelDefinition): PlanInput {
  const content = createOfficialProfileContent(definition, {
    providers: ['openai'],
    allowFallback: false,
    configuration: openaiConfiguration,
  })
  if ('rejected' in content) throw Error(content.rejected)
  const original = input()
  return {
    ...original,
    routeName: definition.modelId,
    provider: 'openai',
    parameters: { reasoningEffort: 'low', maxOutputTokens: 64 },
    messages: [message('user', 'retained prefix', 'u1')],
    snapshot: {
      ...original.snapshot,
      ...definition.capabilities,
      adaptation: content.ok.adaptation,
      providers: content.ok.providers,
      allowFallback: false,
    },
  }
}
const retirePolicy: RetirementPolicy = {
  waitMilliseconds: 10,
  force: false,
  schedule: (ms, fn) => {
    const timer = setTimeout(fn, ms)
    return () => clearTimeout(timer)
  },
}
const raw = {
  prompt_tokens: new LosslessNumber('900719925474099312345'),
  completion_tokens: 3,
  prompt_tokens_details: { cached_tokens: 60, cache_write_tokens: 10 },
  cost: new LosslessNumber('0.000000000000000123'),
}
const current = openaiDefinitions.find(d => d.modelId === 'openai/gpt-5.6-sol-pro')!
describe('exact OpenAI Pro usage scope', () => {
  it.each(
    Object.values(openAiFamilyRecords)
      .filter(row => row.inputScope === 'scope_unknown')
      .map(row => row.modelId),
  )('%s preserves accounts but cannot form an input anchor', async model => {
    const definition = openaiDefinitions.find(d => d.modelId === model)!
    const value = await request(definition)
    const scope = usageScope(model)
    expect(scope).toBe('scope_unknown')
    const unknown = createReadFactsAccumulator(() => {}, false, scope)
    const inherited = createReadFactsAccumulator(() => {}, false, 'inherited_context_total')
    unknown.observe(raw)
    inherited.observe(raw)
    expect(writeJsonLossless(unknown.read().usage)).toBe(writeJsonLossless(inherited.read().usage))
    expect(writeJsonLossless(unknown.read().cost)).toBe(writeJsonLossless(inherited.read().cost))
    expect(unknown.read().observedInput).toEqual({ kind: 'unavailable', reason: 'scope_unknown' })
    expect(inherited.read().observedInput.kind).toBe('from_usage')
    const currentGpt6Pro = [
      'openai/gpt-6-astra-pro',
      'openai/gpt-6-sol-pro',
      'openai/gpt-6-luna-pro',
    ].includes(model)
    expect(definition.implementation.revision).toBe('mp4-18')
    if (currentGpt6Pro) expect(createOpenAiInputMeter(definition).definitionRevision).toBe('6')
    else {
      expect(createOpenAiInputMeter(definition).transformRevision).toBe(
        'openrouter-input-transform/pro-scope-1',
      )
      expect(() =>
        createOpenAiInputMeter({
          ...definition,
          revision: '4',
          implementation: { name: 'pi-ai:openai', revision: 'mp4-5' },
        }),
      ).toThrow('unsupported OpenAI')
    }
  })
  it('preserves missing/cache/conflict priority, partial counters and repeated cumulative facts', () => {
    const state = createReadFactsAccumulator(() => {}, false, 'scope_unknown')
    expect(state.read().observedInput).toEqual({ kind: 'unavailable', reason: 'missing_usage' })
    state.observe({ prompt_tokens: 10, completion_tokens: 3 })
    expect(state.read().usage.cache_write_tokens).toBe('unknown')
    expect(state.read().observedInput).toEqual({ kind: 'unavailable', reason: 'scope_unknown' })
    state.observe({ prompt_tokens: 10, completion_tokens: 3 })
    expect(state.read().usage.output_tokens).toBe(3)
    state.observe({ prompt_tokens: 11 })
    expect(state.read().observedInput).toEqual({
      kind: 'unavailable',
      reason: 'inconsistent_usage',
    })
    for (const usage of [
      { prompt_tokens: -1 },
      { prompt_tokens: 1, prompt_tokens_details: { cached_tokens: 2 } },
      { prompt_tokens: 'bad' },
    ]) {
      const s = createReadFactsAccumulator(() => {}, false, 'scope_unknown')
      s.observe(usage)
      expect(s.read().observedInput).toEqual({ kind: 'unavailable', reason: 'inconsistent_usage' })
    }
    const hit = createReadFactsAccumulator(() => {}, true, 'scope_unknown')
    hit.observe({ prompt_tokens: -1 })
    expect(hit.read().observedInput).toEqual({ kind: 'unavailable', reason: 'response_cache' })
    const zero = createReadFactsAccumulator(() => {}, false, 'scope_unknown')
    zero.observe({ prompt_tokens: 0 })
    expect(zero.read().observedInput).toEqual({ kind: 'unavailable', reason: 'scope_unknown' })
  })
  it('uses only the finite model scope and offers no prior binding scope promotion', () => {
    expect(usageScope(current.modelId)).toBe('scope_unknown')
    expect(usageScope('custom/not-an-openai-pro')).toBe('inherited_context_total')
  })
})

describe('real TLS Pro reader and fixed registry groups', () => {
  let cert: ReturnType<typeof certificate>
  beforeAll(() => {
    cert = certificate()
  })
  afterAll(() => cert.dispose())
  it('keeps Pro scope unknown on direct calls and retiring current registry leases', async () => {
    const host = await fixture(
      cert.tls,
      res =>
        res.end(
          sse({
            model: current.modelId,
            provider: 'OpenAI',
            choices: [{ delta: { content: 'answer' } }],
          }) +
            sse({
              choices: [],
              usage: {
                prompt_tokens: 100,
                completion_tokens: 3,
                prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
                cost: 0.01,
              },
            }) +
            finish(),
        ),
      {},
      undefined,
      [current],
    )
    const service = createModelTransportService(host.options)
    const registeredOld = service.registerAdaptation(
      current,
      createOpenAiInputMeter(current),
      {},
      () => {},
    )
    const original = await request(current)
    const acquiredOld = service.acquire(original.snapshot.adaptation, original.routeName)
    if ('rejected' in acquiredOld) throw Error('old acquisition failed')
    const old = acquiredOld.lease
    const run = async (transport: typeof old.transport, value: PlanInput) => {
      const response = await invokeModel({
        ...value,
        transport,
        credential: 'local',
        signal: new AbortController().signal,
        policy: policy(),
      }).outcome
      if (!('outcome' in response)) throw Error(JSON.stringify(response))
      return response
    }
    try {
      const first = await run(old.transport, original)
      expect(first.inputCalibration.observedInput).toEqual({
        kind: 'unavailable',
        reason: 'scope_unknown',
      })
      if ('rejected' in registeredOld) throw Error('registration failed')
      const retiring = service.retire(registeredOld.registered, {
        waitMilliseconds: 1,
        force: false,
        schedule: (ms, fn) => {
          const timer = setTimeout(fn, ms)
          return () => clearTimeout(timer)
        },
      })
      expect(service.acquire(original.snapshot.adaptation, original.routeName)).toEqual({
        rejected: 'unavailable',
      })
      const again = await run(old.transport, original)
      expect(again.inputCalibration.observedInput).toEqual(first.inputCalibration.observedInput)
      const direct = createPiAiTransport({
        ...host.options,
        definitions: [current],
        inputMeters: [createOpenAiInputMeter(current)],
      })
      try {
        const base = await request(current)
        const result = await run(direct, base)
        expect(result.inputCalibration.observedInput).toEqual({
          kind: 'unavailable',
          reason: 'scope_unknown',
        })
        expect(writeJsonLossless(result.usage)).toBe(writeJsonLossless(first.usage))
        expect(writeJsonLossless(result.cost)).toBe(writeJsonLossless(first.cost))
        for (const source of [
          first.inputCalibration,
          {
            ...result.inputCalibration,
            observedInput: {
              kind: 'from_usage' as const,
              provenance: {
                adapterRevision: PRO_READER_REVISION,
                fieldPaths: ['usage.prompt_tokens'] as [string],
                upstreamModel: current.modelId,
                servingProvider: 'OpenAI',
              },
            },
          },
        ]) {
          const planned = await direct.plan(
            {
              ...base,
              messages: [...base.messages, message('user', 'next', 'u2')],
              calibration: {
                kind: 'observation',
                inputCalibration: source,
                usage: first.usage,
                outputBlocks: first.blocks,
                replaySelection: [],
              },
            },
            { signal: new AbortController().signal },
          )
          if ('rejected' in planned) throw Error(JSON.stringify(planned))
          expect(planned.planned.measurement).toMatchObject({
            mode: 'full',
            fallbackReason: 'source_unavailable',
          })
        }
      } finally {
        await direct.close()
      }
      old.release()
      await retiring
    } finally {
      old.release()
      await service.close(retirePolicy)
      await host.close()
    }
  })
})

describe('current Pro direct reader terminal facts', () => {
  let cert: ReturnType<typeof certificate>
  beforeAll(() => {
    cert = certificate()
  })
  afterAll(() => cert.dispose())
  it.each(['cancel-known', 'cancel-missing', 'truncated', 'invalid-json', 'cache-hit'])(
    'preserves accounts and scope on %s',
    async ending => {
      const host = await fixture(
        cert.tls,
        res => {
          res.writeHead(200, {
            'content-type': 'text/event-stream',
            ...(ending === 'cache-hit' ? { 'X-OpenRouter-Cache-Status': 'HIT' } : {}),
          })
          res.write(
            (ending === 'cancel-missing'
              ? ''
              : sse({
                  choices: [],
                  usage: { prompt_tokens: 100, completion_tokens: 3, cost: 0.01 },
                })) + sse({ choices: [{ delta: { content: 'partial' } }] }),
          )
          if (!ending.startsWith('cancel'))
            res.end(
              ending === 'invalid-json'
                ? 'data: {bad}\n\n'
                : ending === 'cache-hit'
                  ? finish()
                  : '',
            )
        },
        {},
        undefined,
        [current],
      )
      const transport = createPiAiTransport({
        ...host.options,
        definitions: [current],
        inputMeters: [createOpenAiInputMeter(current)],
      })
      try {
        const plan = await transport.plan(await request(current), {
          signal: new AbortController().signal,
        })
        if ('rejected' in plan) throw Error(JSON.stringify(plan))
        const controller = new AbortController()
        const sent = await transport.send(plan.planned, 'local', controller.signal)
        if (!('response' in sent)) throw Error('not sent')
        const reader = transport.read(sent.response, plan.planned, controller.signal)
        expect((await reader.next()).done).toBe(false)
        if (ending.startsWith('cancel')) controller.abort()
        let end = await reader.next()
        while (!end.done) end = await reader.next()
        expect(end.value.readFacts.observedInput).toEqual({
          kind: 'unavailable',
          reason:
            ending === 'cancel-missing'
              ? 'missing_usage'
              : ending === 'cache-hit'
                ? 'response_cache'
                : 'scope_unknown',
        })
        expect(end.value.readFacts.usage.output_tokens).toBe(
          ending === 'cancel-missing' ? 'unknown' : 3,
        )
        if (ending !== 'cancel-missing')
          expect(writeJsonLossless(end.value.readFacts.cost.cost_usd)).toBe('0.01')
        if (ending.startsWith('cancel')) expect(end.value).toMatchObject({ aborted: true })
        await sent.response.stopped
      } finally {
        await transport.close()
        await host.close()
      }
    },
    3000,
  )
})
