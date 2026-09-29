import { directFull } from './direct-full-input.ts'
import { getEncoding } from 'js-tiktoken'
import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { writeJsonLossless, type JsonObject } from '@omne-harness-lite/content-blocks'
import type { PlanInput } from '@omne-harness-lite/model-request-runtime'
import { createOfficialProfileContent } from '../src/configuration.ts'
import { createOpenAiInputMeter } from '../src/input-meters/openai.ts'
import { openaiConfiguration, openaiDefinitions } from '../src/official-models/openai.ts'
import { object, strictObject } from '../src/json.ts'
import { planRequest } from '../src/plan.ts'
import { createModelTransportService } from '../src/registry.ts'
import {
  at,
  certificate,
  content,
  finish,
  fixture,
  input as testInput,
  message,
  sse,
} from './support.ts'
import cases from './fixtures/openai/sol-luna-text-cases.json' with { type: 'json' }

const models = ['openai/gpt-6-sol', 'openai/gpt-6-luna']
function definition(modelId: string) {
  const selected = openaiDefinitions.find(d => d.modelId === modelId)
  if (!selected) throw new Error('missing exact definition')
  return selected
}
function bodyFor(modelId: string, set = 'fit'): JsonObject {
  const c = cases.find(c => c.modelId === modelId && c.set === set)
  if (!c || createHash('sha256').update(c.wire).digest('hex') !== c.requestSha256)
    throw new Error('calibration fixture changed')
  const body = strictObject(c.wire)
  if (!body) throw new Error('invalid fixture body')
  return body
}
function textAt(body: JsonObject, index: number, part: number): string {
  const m = Array.isArray(body.messages) ? body.messages[index] : undefined
  const p = object(m) && Array.isArray(m.content) ? m.content[part] : undefined
  if (!object(p) || typeof p.text !== 'string') throw new Error('missing text')
  return p.text
}
function request(modelId: string, set = 'fit'): PlanInput {
  const selected = definition(modelId)
  const profile = createOfficialProfileContent(selected, {
    providers: ['openai'],
    allowFallback: false,
    configuration: openaiConfiguration,
  })
  if ('rejected' in profile) throw new Error(profile.rejected)
  const input = testInput()
  const body = bodyFor(modelId, set)
  return {
    ...input,
    routeName: modelId,
    provider: 'openai',
    calibration: { kind: 'none' as const, reason: 'no_observation' as const },
    tokenMargin: { multiplier: 1.1, reserveTokens: 64 },
    parameters: { reasoningEffort: 'low', maxOutputTokens: 16 },
    messages: [
      message('system', textAt(body, 0, 0), 'system'),
      message('system_reminder', textAt(body, 1, 1), 'reminder'),
      message('user', textAt(body, 2, 0), 'question'),
    ],
    snapshot: {
      adaptation: profile.ok.adaptation,
      providers: profile.ok.providers,
      allowFallback: profile.ok.allowFallback,
      inputModalities: profile.ok.inputModalities,
      outputModalities: profile.ok.outputModalities,
      maxInputTokens: profile.ok.maxInputTokens,
      maxOutputTokens: profile.ok.maxOutputTokens,
      inputConstraints: profile.ok.inputConstraints,
      upstreamInputLimits: profile.ok.upstreamInputLimits,
      updatedAt: at,
    },
  }
}

describe('GPT-6 Sol and Luna visible-history estimators', () => {
  let cert: ReturnType<typeof certificate>
  beforeAll(() => {
    cert = certificate()
  })
  afterAll(() => cert.dispose())

  it.each(models)('%s binds only the current exact revision', modelId => {
    const selected = definition(modelId)
    expect(createOpenAiInputMeter(selected)).toMatchObject(
      modelId === 'openai/gpt-6-sol'
        ? { definitionRevision: '4', implementation: { revision: 'mp4-15' } }
        : { definitionRevision: '5', implementation: { revision: 'mp4-15' } },
    )
    expect(() => createOpenAiInputMeter({ ...selected, revision: '1' })).toThrow(TypeError)
    expect(() =>
      createOpenAiInputMeter({
        ...selected,
        implementation: { name: 'pi-ai:openai', revision: 'mp4-1' },
      }),
    ).toThrow(TypeError)
  })

  it.each(cases)('reproduces independently observed $id without changing the wire', c => {
    const body = bodyFor(c.modelId, c.set)
    const meter = createOpenAiInputMeter(definition(c.modelId))
    const measurement = directFull(meter, { body, serialized: c.wire })
    expect(measurement.kind).toBe('estimated')
    // Keep the original independent text-proxy observations distinct from
    // the new complete-history JSON estimate; no claim of unchanged counts.
    const tokenizer = getEncoding('o200k_base')
    const originalProxy = [
      textAt(body, 0, 0),
      textAt(body, 1, 0),
      textAt(body, 1, 1),
      textAt(body, 2, 0),
    ].reduce((sum, text) => sum + tokenizer.encode(text).length, 14)
    expect(originalProxy).toBe(
      c.modelId === 'openai/gpt-6-sol'
        ? c.set === 'fit'
          ? 435
          : 239
        : c.set === 'fit'
          ? 438
          : 242,
    )
    expect(measurement).toEqual({
      kind: 'estimated',
      tokens: tokenizer.encode(writeJsonLossless(body)).length,
    })
    const planned = planRequest(request(c.modelId, c.set), [definition(c.modelId)], meter)
    if ('rejected' in planned) throw new Error(JSON.stringify(planned))
    expect(planned.planned.serialized).toBe(c.wire)
    expect(planned.planned.inputLimitEvidence.inputTokens.kind).toBe('estimated')
    expect(directFull(meter, { body, serialized: `${c.wire} ` })).toEqual({ kind: 'unavailable' })
  })

  it.each(models)(
    '%s keeps longer text and independent output controls available as estimates',
    modelId => {
      const input = request(modelId)
      const long: PlanInput = {
        ...input,
        parameters: { reasoningEffort: 'low', maxOutputTokens: 2048 },
        messages: [
          ...input.messages.slice(0, 2),
          message('user', '更长的文本 and code const n = 17; '.repeat(400), 'question'),
        ],
      }
      const planned = planRequest(
        long,
        [definition(modelId)],
        createOpenAiInputMeter(definition(modelId)),
      )
      if ('rejected' in planned) throw new Error(JSON.stringify(planned))
      expect(planned.planned.inputLimitEvidence.inputTokens.kind).toBe('estimated')
      expect(planned.planned.serialized).toContain('"max_tokens":2048')
      expect(planned.planned.serialized).toContain('更长的文本')
      const limited = planRequest(
        { ...long, snapshot: { ...input.snapshot, maxInputTokens: 100 } },
        [definition(modelId)],
        createOpenAiInputMeter(definition(modelId)),
      )
      expect(limited).toMatchObject({
        rejected: 'invalidInput',
        reason: 'input_limit_exceeded',
        basis: 'estimated',
      })
    },
  )

  it.each(models)(
    '%s refuses unsupported final fields, effort and opaque/media shapes',
    modelId => {
      const meter = createOpenAiInputMeter(definition(modelId))
      const body = bodyFor(modelId)
      for (const changed of [
        { ...body, model: 'openai/gpt-6-astra' },
        { ...body, tools: [] },
        { ...body, reasoning: { effort: 'unsupported-effort' } },
        { ...body, reasoning: { effort: 'low', mode: 'pro' } },
        { ...body, prompt_cache_options: { ttl: '1h' } },
        {
          ...body,
          messages: [
            { role: 'system', content: [{ type: 'text', text: 'system' }] },
            {
              role: 'developer',
              content: [
                { type: 'text', text: 'reminder' },
                { type: 'text', text: 'policy' },
              ],
            },
            {
              role: 'user',
              content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }],
            },
          ],
        },
        {
          ...body,
          messages: [
            {
              role: 'assistant',
              content: '',
              reasoning_details: [{ type: 'reasoning.encrypted', data: 'opaque' }],
            },
          ],
        },
      ])
        expect(
          directFull(meter, { body: changed, serialized: writeJsonLossless(changed) }),
        ).toEqual({
          kind: 'unavailable',
        })
      const oneVisibleUser = {
        ...body,
        messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
      }
      expect(
        directFull(meter, { body: oneVisibleUser, serialized: writeJsonLossless(oneVisibleUser) })
          .kind,
      ).toBe('estimated')
    },
  )

  it.each(models)(
    '%s sends the exact plan via a service lease and preserves unsupported history',
    async modelId => {
      const selected = definition(modelId)
      const meter = createOpenAiInputMeter(selected)
      const host = await fixture(
        cert.tls,
        res =>
          res.end(
            content('ready') +
              sse({
                choices: [],
                usage: {
                  prompt_tokens: 501,
                  completion_tokens: 2,
                  prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
                },
              }) +
              finish(),
          ),
        {},
        undefined,
        [selected],
      )
      const service = createModelTransportService(host.options)
      let lease: ReturnType<typeof service.acquire> | undefined
      try {
        const registered = service.registerAdaptation(selected, meter, {}, () => {})
        if ('rejected' in registered) throw new Error(registered.rejected)
        const input = request(modelId)
        lease = service.acquire(input.snapshot.adaptation, modelId)
        if ('rejected' in lease) throw new Error(lease.rejected)
        const transport = lease.lease.transport
        const history = [
          ...input.messages,
          message('user', 'Keep this complete history.', 'followup'),
        ]
        const historyPlan = transport.plan({ ...input, messages: history })
        if ('rejected' in historyPlan) throw new Error(JSON.stringify(historyPlan))
        expect(historyPlan.planned.serialized).toContain('Keep this complete history.')
        expect(history).toHaveLength(4)
        const high = transport.plan({
          ...input,
          parameters: { reasoningEffort: 'high', maxOutputTokens: 16 },
        })
        expect(high).toHaveProperty('planned')
        const withTools = transport.plan({
          ...input,
          tools: [
            {
              name: 'lookup',
              description: 'Lookup a fact',
              parameters: { type: 'object', properties: {} },
            },
          ],
        })
        expect(withTools).toHaveProperty('planned')
        expect(host.requests).toHaveLength(0)
        const planned = transport.plan(input)
        if ('rejected' in planned) throw new Error(JSON.stringify(planned))
        const signal = new AbortController().signal
        const sent = await transport.send(planned.planned, 'controlled-service-credential', signal)
        if (!('response' in sent)) throw new Error(JSON.stringify(sent))
        const events = []
        for await (const event of transport.read(sent.response, planned.planned, signal))
          events.push(event)
        expect(events).toContainEqual(expect.objectContaining({ t: 'account' }))
        const account = events.find(event => event.t === 'account')
        if (!account || account.t !== 'account') throw new Error('missing upstream account')
        expect(writeJsonLossless(account.usage.input_tokens)).toBe('501')
        expect(host.requests).toHaveLength(1)
        expect(host.requests[0]?.body).toBe(planned.planned.serialized)
        expect(host.requests[0]?.body).toContain('"role":"developer"')
      } finally {
        if (lease && 'lease' in lease) lease.lease.release()
        await service.close({
          force: false,
          waitMilliseconds: 20,
          schedule(ms, callback) {
            const timer = setTimeout(callback, ms)
            return () => clearTimeout(timer)
          },
        })
        await service.closed
        await host.close()
      }
    },
  )
})
