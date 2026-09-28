import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import type { PlanInput } from '@omne-harness-lite/model-request-runtime'
import type { ModelToolEntry } from '@omne-harness-lite/tool-definition'
import { createOfficialProfileContent, interpretConfiguration } from '../src/configuration.ts'
import { createPiAiTransport } from '../src/transport.ts'
import { planRequest } from '../src/plan.ts'
import { object } from '../src/json.ts'
import { createQwenInputMeter, renderQwenPrompt } from '../src/input-meters/qwen.ts'
import {
  qwenAlibabaModelIds,
  qwenDefinitions,
  type QwenAlibabaModelId,
} from '../src/official-models/qwen.ts'
import {
  certificate,
  content,
  finish,
  fixture,
  input as testInput,
  message,
  sse,
} from './support.ts'

const ids = ['qwen/qwen3.8-2.4t-a95b', 'qwen/qwen3.8-27b'] as const
const commercial = qwenAlibabaModelIds.filter(modelId => !ids.some(id => id === modelId))
const localResponse =
  content('done') +
  sse({
    choices: [],
    usage: {
      prompt_tokens: 100,
      completion_tokens: 3,
      prompt_tokens_details: { cached_tokens: 20, cache_write_tokens: 4 },
    },
  }) +
  finish()
const tool: ModelToolEntry = {
  name: 'lookup__exact',
  description: 'Exact lookup',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query'],
    additionalProperties: false,
  },
}

function definition(modelId: QwenAlibabaModelId) {
  const selected = qwenDefinitions.find(item => item.modelId === modelId)
  if (!selected) throw new Error(`missing definition: ${modelId}`)
  return selected
}

function request(modelId: QwenAlibabaModelId): PlanInput {
  const selected = definition(modelId)
  const cache =
    selected.routes.alibaba?.cache.mode === 'automatic'
      ? { mode: 'automatic' }
      : { mode: 'explicit', ttl: '5m', breakpoints: ['system'] }
  const profile = createOfficialProfileContent(selected, {
    providers: ['alibaba'],
    allowFallback: false,
    configuration: {
      revision: '1',
      values: { cache },
    },
  })
  if ('rejected' in profile) throw new Error(profile.rejected)
  const baseline = testInput()
  return {
    ...baseline,
    routeName: modelId,
    provider: 'alibaba',
    parameters: { maxOutputTokens: 64 },
    messages: [...baseline.messages, message('user', 'A second question', 'second')],
    tools: [tool],
    tokenMargin: { multiplier: 1.1, reserveTokens: 64 },
    snapshot: {
      ...baseline.snapshot,
      adaptation: profile.ok.adaptation,
      providers: profile.ok.providers,
      allowFallback: profile.ok.allowFallback,
      inputModalities: profile.ok.inputModalities,
      outputModalities: profile.ok.outputModalities,
      maxInputTokens: profile.ok.maxInputTokens,
      maxOutputTokens: profile.ok.maxOutputTokens,
      inputConstraints: profile.ok.inputConstraints,
      upstreamInputLimits: profile.ok.upstreamInputLimits,
    },
  }
}

const fixtureBody = JSON.parse(
  readFileSync(new URL('./fixtures/qwen/text-tool-history.json', import.meta.url), 'utf8'),
)
if (!object(fixtureBody)) throw new Error('invalid Qwen golden fixture')

let cert: ReturnType<typeof certificate>
beforeAll(() => {
  cert = certificate()
})
afterAll(() => cert.dispose())

describe('Qwen3.8 public tokenizer input meters', () => {
  it('pins the eight credentialed certification case identities and accepted cache configurations', () => {
    const raw: unknown = JSON.parse(
      readFileSync(new URL('./fixtures/qwen/authentication-cases.json', import.meta.url), 'utf8'),
    )
    if (!object(raw) || !Array.isArray(raw.cases)) throw new Error('invalid case manifest')
    expect(raw.cases.map(item => (object(item) ? item.modelId : undefined))).toEqual(
      qwenAlibabaModelIds,
    )
    for (const item of raw.cases) {
      if (!object(item) || typeof item.modelId !== 'string' || !object(item.cache))
        throw new Error('invalid Qwen certification case')
      const selected = qwenDefinitions.find(candidate => candidate.modelId === item.modelId)
      if (!selected) throw new Error('unrecognized Qwen certification case')
      expect(interpretConfiguration(selected, { cache: item.cache }, 'alibaba')).toHaveProperty(
        'ok',
      )
    }
  })

  it.each(ids)(
    '%s pins its published tokenizer and counts a complete text/tool request',
    modelId => {
      const selected = definition(modelId)
      const meter = createQwenInputMeter(selected)
      const body = { ...fixtureBody, model: modelId }
      const serialized = writeJsonLossless(body)
      const result = meter.measure({ body, serialized })
      expect(meter).toMatchObject({
        modelId,
        definitionRevision: selected.revision,
        implementation: selected.implementation,
        provider: 'alibaba',
        algorithmRevision: 'qwen-38-public-template-1',
      })
      expect(meter.evidence).toContain(
        'sha256:0997f410c57a1f4e53b09e4be8f4a172d90edd9564368fb0847030937229b9f3',
      )
      expect(result).toEqual({ kind: 'estimated', tokens: 397 })
      const rendered = renderQwenPrompt(body)
      expect(rendered).toBe(
        readFileSync(
          new URL(
            `./fixtures/qwen/public-template-${modelId === ids[0] ? '24t' : '27b'}.txt`,
            import.meta.url,
          ),
          'utf8',
        ),
      )
      expect(
        createHash('sha256')
          .update(rendered ?? '')
          .digest('hex'),
      ).toBe('f11af7837f56be5147adb5f45191287dde95c28790eba9fb0e16a771c50c548a')
      expect(meter.measure({ body, serialized: '{}' })).toEqual({ kind: 'unavailable' })
      const differentOutputCap = { ...body, max_tokens: 128 }
      expect(
        meter.measure({
          body: differentOutputCap,
          serialized: writeJsonLossless(differentOutputCap),
        }),
      ).toEqual(result)
      expect(() => createQwenInputMeter({ ...selected, revision: 'other' })).toThrow(TypeError)
    },
  )

  it('changes the estimate when tool schema, tool result, reminder, or prior reasoning changes', () => {
    const meter = createQwenInputMeter(definition(ids[0]))
    const original = writeJsonLossless(fixtureBody)
    const originalResult = meter.measure({ body: fixtureBody, serialized: original })
    if (originalResult.kind === 'unavailable') throw new Error('golden unavailable')
    for (const text of ['lookup__exact', 'value=42', 'Review the exact value.', 'Need a lookup.']) {
      const changed = original.replace(text, '')
      const body = JSON.parse(changed)
      if (!object(body)) throw new Error('invalid altered fixture')
      const result = meter.measure({ body, serialized: changed })
      expect(result).toMatchObject({ kind: 'estimated' })
      if (result.kind === 'unavailable') throw new Error('altered fixture unavailable')
      expect(result.tokens).not.toBe(originalResult.tokens)
    }
  })

  it('rejects visual blocks instead of treating encoded image bytes as text tokens', () => {
    const meter = createQwenInputMeter(definition(ids[1]))
    const body = {
      ...fixtureBody,
      model: ids[1],
      messages: [
        {
          role: 'user',
          content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }],
        },
      ],
    }
    expect(meter.measure({ body, serialized: writeJsonLossless(body) })).toEqual({
      kind: 'unavailable',
    })
  })

  it.each(ids)('%s refuses unmapped OpenRouter high/max reasoning effort', modelId => {
    const meter = createQwenInputMeter(definition(modelId))
    for (const effort of ['high', 'max'] as const) {
      const body = { ...fixtureBody, model: modelId, reasoning: { effort } }
      expect(meter.measure({ body, serialized: writeJsonLossless(body) })).toEqual({
        kind: 'unavailable',
      })
      expect(
        planRequest(
          { ...request(modelId), parameters: { maxOutputTokens: 64, reasoningEffort: effort } },
          [definition(modelId)],
          meter,
        ),
      ).toMatchObject({ rejected: 'invalidInput', reason: 'input_size_unavailable' })
    }
  })

  it.each(ids)(
    '%s plans and sends the identical counted wire body through the real factory',
    async modelId => {
      const selected = definition(modelId)
      const meter = createQwenInputMeter(selected)
      const host = await fixture(cert.tls, res => res.end(localResponse), {}, undefined, [selected])
      const transport = createPiAiTransport({
        ...host.options,
        definitions: [selected],
        inputMeters: [meter],
      })
      try {
        const planned = transport.plan(request(modelId))
        if ('rejected' in planned) throw new Error(JSON.stringify(planned))
        expect(planned.planned.inputLimitEvidence.inputTokens.kind).toBe('estimated')
        expect(planned.planned.inputLimitEvidence.tokenMargin).toEqual({
          multiplier: 1.1,
          reserveTokens: 64,
        })
        expect(planned.planned.body.messages).toHaveLength(4)
        expect(planned.planned.body.tools).toHaveLength(1)
        const sent = await transport.send(
          planned.planned,
          'qwen-local-only-credential',
          new AbortController().signal,
        )
        if (!('response' in sent)) throw new Error(JSON.stringify(sent))
        const events = []
        for await (const event of transport.read(
          sent.response,
          planned.planned,
          new AbortController().signal,
        )) {
          events.push(event)
        }
        expect(host.requests).toHaveLength(1)
        expect(host.requests[0]?.body).toBe(planned.planned.serialized)
        expect(host.requests[0]?.body).toContain('lookup__exact')
        expect(host.requests[0]?.body).toContain('system_reminder')
        expect(host.requests[0]?.body).not.toContain('qwen-local-only-credential')
        expect(planned.planned.serialized).toContain('"ttl":"5m"')
        const account = events.find(event => event.t === 'account')
        expect(writeJsonLossless(account ?? null)).toContain('"cache_write_tokens":4')
        expect(writeJsonLossless(account ?? null)).toContain('"input_tokens":76')
        expect(planRequest(request(modelId), [selected], meter)).toHaveProperty('planned')
      } finally {
        await transport.close()
        await host.close()
      }
    },
  )

  it.each(commercial)(
    '%s projects its actual definition to local HTTPS wire with a synthetic meter only',
    async modelId => {
      const selected = definition(modelId)
      const host = await fixture(cert.tls, res => res.end(localResponse), {}, undefined, [selected])
      try {
        const planned = host.transport.plan(request(modelId))
        if ('rejected' in planned) throw new Error(JSON.stringify(planned))
        const signal = new AbortController().signal
        const sent = await host.transport.send(
          planned.planned,
          'qwen-local-only-credential',
          signal,
        )
        if (!('response' in sent)) throw new Error(JSON.stringify(sent))
        const events = []
        for await (const event of host.transport.read(sent.response, planned.planned, signal))
          events.push(event)
        expect(host.requests).toHaveLength(1)
        expect(host.requests[0]?.path).toBe('/api/v1/chat/completions')
        expect(host.requests[0]?.body).toBe(planned.planned.serialized)
        expect(host.requests[0]?.body).toContain(modelId)
        expect(host.requests[0]?.body).toContain('lookup__exact')
        expect(host.requests[0]?.body).not.toContain('qwen-local-only-credential')
        expect(planned.planned.serialized.includes('cache_control')).toBe(
          selected.routes.alibaba?.cache.mode === 'explicit',
        )
        const account = events.find(event => event.t === 'account')
        expect(writeJsonLossless(account ?? null)).toContain('"input_tokens":76')
      } finally {
        await host.close()
      }
    },
  )
})
