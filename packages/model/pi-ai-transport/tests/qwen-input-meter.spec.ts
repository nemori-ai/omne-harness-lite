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
import {
  createQwenInputMeter,
  qwenUnscaledImageTokens,
  renderQwenHostedFlashPrompt,
  renderQwenHostedMaxPrompt,
  renderQwenPrompt,
} from '../src/input-meters/qwen.ts'
import {
  qwenAlibabaModelIds,
  qwenDefinitions,
  type QwenAlibabaModelId,
} from '../src/official-models/qwen.ts'
import {
  at,
  certificate,
  content,
  finish,
  fixture,
  input as testInput,
  judgedMessage,
  message,
  sse,
} from './support.ts'

const ids = ['qwen/qwen3.8-2.4t-a95b', 'qwen/qwen3.8-27b'] as const
const commercial = qwenAlibabaModelIds.filter(modelId => !ids.some(id => id === modelId))
const unboundCommercial = commercial.filter(
  modelId =>
    modelId !== 'qwen/qwen3.8-max-0902' &&
    modelId !== 'qwen/qwen3.8-flash' &&
    modelId !== 'qwen/qwen3.7-flash',
)
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
  const assistant = judgedMessage({
    id: 'qwen-assistant',
    type: 'assistant',
    response: 'qwen-response-1',
    ending: 'complete',
    createdAt: at,
    blocks: [
      {
        id: 'qwen-thinking',
        kind: 'thinking',
        text: 'Need an exact lookup.',
        visibility: { toHuman: false, toModel: true },
      },
      {
        id: 'qwen-call',
        kind: 'tool_call',
        callId: 'call_alpha',
        tool: tool.name,
        complete: true,
        arguments: { query: 'alpha' },
        visibility: { toHuman: true, toModel: true },
      },
    ],
  })
  const toolResult = judgedMessage({
    id: 'qwen-tool',
    type: 'tool',
    callId: 'call_alpha',
    createdAt: at,
    blocks: [
      {
        id: 'qwen-tool-result',
        kind: 'tool_result',
        callId: 'call_alpha',
        outcome: 'completed',
        visibility: { toHuman: true, toModel: true },
        blocks: [
          {
            id: 'qwen-tool-text',
            kind: 'text',
            text: 'value=42',
            visibility: { toHuman: true, toModel: true },
          },
        ],
      },
    ],
  })
  return {
    ...baseline,
    routeName: modelId,
    provider: 'alibaba',
    parameters: { maxOutputTokens: 64 },
    messages: [
      ...baseline.messages,
      assistant,
      toolResult,
      message('user', 'A second question', 'second'),
    ],
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
const unicodeBody = JSON.parse(
  readFileSync(new URL('./fixtures/qwen/unicode-tool-history.json', import.meta.url), 'utf8'),
)
if (!object(unicodeBody)) throw new Error('invalid Qwen Unicode fixture')

let cert: ReturnType<typeof certificate>
beforeAll(() => {
  cert = certificate()
})
afterAll(() => cert.dispose())

describe('Qwen3.8 public tokenizer input meters', () => {
  it('fits the independent Flash offset and matches its untouched final-wire holdout', () => {
    const selected = definition('qwen/qwen3.8-flash')
    const meter = createQwenInputMeter(selected)
    expect(selected.implementation.revision).toBe('mp4-4')
    expect(meter.algorithmRevision).toBe('qwen-38-hosted-flash-chatml-offset-1')
    const golden: unknown = JSON.parse(
      readFileSync(new URL('./fixtures/qwen/flash-route-golden.json', import.meta.url), 'utf8'),
    )
    if (!object(golden) || !Array.isArray(golden.rows)) throw new Error('invalid Flash golden')
    expect(golden.sourceResultSha256).toBe(
      '32a526bb147b4fffd26de4e669d6132592190ce1100d88c6fc81b74fed8d6c11',
    )
    expect(golden.sourceGenerationVerificationSha256).toBe(
      'bbc15cae1443828472b6d026ae2894c01bc144413da00c1ded306be103952c03',
    )
    const fitted: number[] = []
    let heldout: number | undefined
    for (const row of golden.rows) {
      if (
        !object(row) ||
        typeof row.file !== 'string' ||
        typeof row.fileSha256 !== 'string' ||
        typeof row.sentSha256 !== 'string' ||
        typeof row.proxyTokens !== 'number' ||
        typeof row.observedInputTokens !== 'number'
      )
        throw new Error('invalid Flash golden row')
      const file = readFileSync(new URL(`./fixtures/qwen/flash-route/${row.file}`, import.meta.url))
      expect(createHash('sha256').update(file).digest('hex')).toBe(row.fileSha256)
      const serialized = file.toString('utf8').trimEnd()
      expect(createHash('sha256').update(serialized).digest('hex')).toBe(row.sentSha256)
      const body: unknown = JSON.parse(serialized)
      if (!object(body)) throw new Error('invalid Flash body')
      const prompt = renderQwenHostedFlashPrompt(body)
      expect(prompt).toContain('<|im_start|>assistant\n<think>\n')
      expect(meter.measure({ body, serialized })).toEqual({
        kind: 'estimated',
        tokens: row.observedInputTokens,
      })
      const residual = row.observedInputTokens - row.proxyTokens
      if (row.phase === 'fit') fitted.push(residual)
      else if (row.phase === 'untouched-holdout') heldout = residual
      else throw new Error('invalid Flash golden phase')
    }
    expect(fitted).toEqual([51, 51, 51])
    expect(heldout).toBe(fitted[0])
  })

  it('rejects Flash shapes outside the observed single text-part final wire', () => {
    const selected = definition('qwen/qwen3.8-flash')
    const meter = createQwenInputMeter(selected)
    const base = JSON.parse(
      readFileSync(
        new URL(
          './fixtures/qwen/flash-route/formal-18-qwen3.8-flash-english.json',
          import.meta.url,
        ),
        'utf8',
      ),
    )
    for (const changed of [
      { ...base, stream: false },
      { ...base, store: null },
      { ...base, messages: [{ role: 'user', content: 'Reply with the single word OK.' }] },
      { ...base, messages: [{ role: 'user', content: null }] },
      { ...base, messages: [{ role: 'user', content: [{ type: 'text', text: '' }] }] },
      { ...base, messages: [{ role: 'system', content: 'Be brief.' }, ...base.messages] },
      { ...base, messages: [...base.messages, ...base.messages] },
      {
        ...base,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'a' },
              { type: 'text', text: 'b' },
            ],
          },
        ],
      },
      {
        ...base,
        messages: [
          {
            role: 'user',
            content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }],
          },
        ],
      },
      { ...base, tools: [{ type: 'function', function: { name: 'lookup', parameters: {} } }] },
      { ...base, reasoning: { effort: 'high' } },
      { ...base, model: 'qwen/qwen3.8-max-0902' },
      { ...base, provider: { order: ['other'], allow_fallbacks: false, require_parameters: true } },
      {
        ...base,
        provider: { order: ['alibaba'], allow_fallbacks: false, require_parameters: false },
      },
    ])
      expect(meter.measure({ body: changed, serialized: writeJsonLossless(changed) })).toEqual({
        kind: 'unavailable',
      })
    const long = {
      ...base,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'x'.repeat(16_384) }] }],
    }
    expect(meter.measure({ body: long, serialized: writeJsonLossless(long) })).toMatchObject({
      kind: 'estimated',
    })
  })

  it('plans and sends Flash through the real meter and local TLS final-wire path', async () => {
    const modelId = 'qwen/qwen3.8-flash'
    const selected = definition(modelId)
    const meter = createQwenInputMeter(selected)
    const host = await fixture(cert.tls, res => res.end(localResponse), {}, undefined, [selected])
    const transport = createPiAiTransport({
      ...host.options,
      definitions: [selected],
      inputMeters: [meter],
    })
    try {
      const input = {
        ...request(modelId),
        messages: [message('user', 'Reply with the single word OK.', 'flash-english')],
        tools: [],
        parameters: { maxOutputTokens: 16 },
      }
      const planned = transport.plan(input)
      if ('rejected' in planned) throw new Error(JSON.stringify(planned))
      const frozen = readFileSync(
        new URL(
          './fixtures/qwen/flash-route/formal-18-qwen3.8-flash-english.json',
          import.meta.url,
        ),
        'utf8',
      ).trimEnd()
      expect(planned.planned.serialized).toBe(frozen)
      expect(planned.planned.inputLimitEvidence.inputTokens).toEqual({
        kind: 'estimated',
        tokens: 68,
      })
      const sent = await transport.send(
        planned.planned,
        'qwen-local-only-credential',
        new AbortController().signal,
      )
      if (!('response' in sent)) throw new Error(JSON.stringify(sent))
      for await (const _event of transport.read(
        sent.response,
        planned.planned,
        new AbortController().signal,
      )) {
        // Consume the local fixture and release its network resource.
      }
      expect(host.requests).toHaveLength(1)
      expect(host.requests[0]?.body).toBe(planned.planned.serialized)
    } finally {
      await transport.close()
      await host.close()
    }
  })

  it('fits Qwen3.7 Flash independently and matches its untouched final-wire holdout', () => {
    const selected = definition('qwen/qwen3.7-flash')
    const meter = createQwenInputMeter(selected)
    expect(selected.implementation.revision).toBe('mp4-5')
    expect(meter.algorithmRevision).toBe('qwen-37-hosted-flash-chatml-offset-1')
    const golden: unknown = JSON.parse(
      readFileSync(new URL('./fixtures/qwen/flash37-route-golden.json', import.meta.url), 'utf8'),
    )
    if (!object(golden) || !Array.isArray(golden.rows)) throw new Error('invalid 3.7 Flash golden')
    expect(golden.sourceGenerationVerificationSha256).toBe(
      '953e8aaa5f0bfc70a1110faa74364a3c279e4467d33686789ff8ecfd8c5000fc',
    )
    expect(golden.upstreamModel).toBe('qwen/qwen3.7-flash-20260727')
    const fit: number[] = []
    let holdout: number | undefined
    for (const row of golden.rows) {
      if (
        !object(row) ||
        typeof row.file !== 'string' ||
        typeof row.fileSha256 !== 'string' ||
        typeof row.sentSha256 !== 'string' ||
        typeof row.sourceObservationSha256 !== 'string' ||
        typeof row.proxyTokens !== 'number' ||
        typeof row.observedInputTokens !== 'number'
      )
        throw new Error('invalid 3.7 Flash golden row')
      const file = readFileSync(
        new URL(`./fixtures/qwen/flash37-route/${row.file}`, import.meta.url),
      )
      expect(createHash('sha256').update(file).digest('hex')).toBe(row.fileSha256)
      const serialized = file.toString('utf8').trimEnd()
      expect(createHash('sha256').update(serialized).digest('hex')).toBe(row.sentSha256)
      const body: unknown = JSON.parse(serialized)
      if (!object(body)) throw new Error('invalid 3.7 Flash wire')
      expect(meter.measure({ body, serialized })).toEqual({
        kind: 'estimated',
        tokens: row.observedInputTokens,
      })
      const residual = row.observedInputTokens - row.proxyTokens
      if (row.phase === 'fit') fit.push(residual)
      else if (row.phase === 'untouched-holdout') holdout = residual
      else throw new Error('invalid 3.7 Flash phase')
    }
    expect(fit).toEqual([0, 0, 0])
    expect(holdout).toBe(fit[0])
  })

  it('keeps Qwen3.7 Flash unavailable outside the calibrated final text-part shape', () => {
    const selected = definition('qwen/qwen3.7-flash')
    const meter = createQwenInputMeter(selected)
    const base = JSON.parse(
      readFileSync(
        new URL(
          './fixtures/qwen/flash37-route/formal-33-qwen3.7-flash-english.json',
          import.meta.url,
        ),
        'utf8',
      ),
    )
    for (const changed of [
      { ...base, stream: false },
      { ...base, store: null },
      { ...base, messages: [{ role: 'user', content: 'Reply with the single word OK.' }] },
      { ...base, messages: [{ role: 'user', content: null }] },
      { ...base, messages: [{ role: 'user', content: [{ type: 'text', text: '' }] }] },
      { ...base, messages: [{ role: 'system', content: 'Be brief.' }, ...base.messages] },
      { ...base, messages: [...base.messages, ...base.messages] },
      {
        ...base,
        messages: [
          {
            role: 'user',
            content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }],
          },
        ],
      },
      { ...base, tools: [{ type: 'function', function: { name: 'lookup', parameters: {} } }] },
      { ...base, reasoning: { effort: 'high' } },
      { ...base, model: 'qwen/qwen3.8-flash' },
      { ...base, provider: { order: ['other'], allow_fallbacks: false, require_parameters: true } },
    ])
      expect(meter.measure({ body: changed, serialized: writeJsonLossless(changed) })).toEqual({
        kind: 'unavailable',
      })
    expect(() =>
      createQwenInputMeter({
        ...selected,
        implementation: { name: 'pi-ai:qwen', revision: 'mp4-1' },
      }),
    ).toThrow('unsupported Qwen definition')
  })

  it('plans and sends Qwen3.7 Flash through the real meter and local TLS final wire', async () => {
    const modelId = 'qwen/qwen3.7-flash'
    const selected = definition(modelId)
    const meter = createQwenInputMeter(selected)
    const host = await fixture(cert.tls, res => res.end(localResponse), {}, undefined, [selected])
    const transport = createPiAiTransport({
      ...host.options,
      definitions: [selected],
      inputMeters: [meter],
    })
    try {
      const input = {
        ...request(modelId),
        messages: [message('user', 'Reply with the single word OK.', 'flash37-english')],
        tools: [],
        parameters: { maxOutputTokens: 16 },
      }
      const planned = transport.plan(input)
      if ('rejected' in planned) throw new Error(JSON.stringify(planned))
      const frozen = readFileSync(
        new URL(
          './fixtures/qwen/flash37-route/formal-33-qwen3.7-flash-english.json',
          import.meta.url,
        ),
        'utf8',
      ).trimEnd()
      expect(planned.planned.serialized).toBe(frozen)
      expect(planned.planned.inputLimitEvidence.inputTokens).toEqual({
        kind: 'estimated',
        tokens: 17,
      })
      const sent = await transport.send(
        planned.planned,
        'qwen-local-only-credential',
        new AbortController().signal,
      )
      if (!('response' in sent)) throw new Error(JSON.stringify(sent))
      for await (const _event of transport.read(
        sent.response,
        planned.planned,
        new AbortController().signal,
      )) {
        // Consume the local fixture and release its network resource.
      }
      expect(host.requests).toHaveLength(1)
      expect(host.requests[0]?.body).toBe(planned.planned.serialized)
    } finally {
      await transport.close()
      await host.close()
    }
  })

  it("renders Alibaba's hosted Max Hi/11-token template and applies the route estimate", () => {
    const modelId = 'qwen/qwen3.8-max-0902'
    const meter = createQwenInputMeter(definition(modelId))
    const body = {
      model: modelId,
      provider: { order: ['alibaba'], allow_fallbacks: false, require_parameters: true },
      stream: true,
      messages: [{ role: 'user', content: 'Hi' }],
      max_tokens: 16,
    }
    const prompt = renderQwenHostedMaxPrompt(body)
    expect(prompt).toBe(
      readFileSync(new URL('./fixtures/qwen/hosted-max-hi.txt', import.meta.url), 'utf8'),
    )
    expect(meter.algorithmRevision).toBe('qwen-38-hosted-max-chatml-offset-2')
    expect(meter.measure({ body, serialized: writeJsonLossless(body) })).toEqual({
      kind: 'estimated',
      tokens: 62,
    })
    const chineseBody = {
      ...body,
      messages: [{ role: 'user', content: '你好' }],
    }
    expect(renderQwenHostedMaxPrompt(chineseBody)).toBe(
      readFileSync(new URL('./fixtures/qwen/hosted-max-nihao.txt', import.meta.url), 'utf8'),
    )
    expect(
      meter.measure({ body: chineseBody, serialized: writeJsonLossless(chineseBody) }),
    ).toEqual({ kind: 'estimated', tokens: 62 })
    for (const changed of [
      { ...body, messages: [{ role: 'system', content: 'Be brief' }, ...body.messages] },
      { ...body, tools: [{ type: 'function', function: { name: 'lookup', parameters: {} } }] },
      { ...body, reasoning: { effort: 'high' } },
      {
        ...body,
        messages: [
          {
            role: 'user',
            content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }],
          },
        ],
      },
    ]) {
      expect(meter.measure({ body: changed, serialized: writeJsonLossless(changed) })).toEqual({
        kind: 'unavailable',
      })
    }
  })

  it('matches three fixed-route Max calibrations and the untouched text holdout', () => {
    const raw: unknown = JSON.parse(
      readFileSync(new URL('./fixtures/qwen/max0902-route-golden.json', import.meta.url), 'utf8'),
    )
    if (!object(raw) || !Array.isArray(raw.rows)) throw new Error('invalid Max route golden')
    expect(raw.sourceObservationsSha256).toBe(
      '464c029984e310a928b3ae74a152e2d15726d6d456dfb154aca8d593d25822e',
    )
    expect(raw.sourceProviderVerificationSha256).toBe(
      '1bb421e92fc128045d1dfdb24907aba73e7c5ba9bafc1af2b79eb6b6ad880836',
    )
    const meter = createQwenInputMeter(definition('qwen/qwen3.8-max-0902'))
    const fit: number[] = []
    let heldout: number | undefined
    for (const row of raw.rows) {
      if (
        !object(row) ||
        typeof row.file !== 'string' ||
        typeof row.sha256 !== 'string' ||
        typeof row.publicTemplateTokens !== 'number' ||
        typeof row.observedPromptTokens !== 'number'
      )
        throw new Error('invalid Max route golden row')
      const bytes = readFileSync(new URL(`./fixtures/qwen/probe-six/${row.file}`, import.meta.url))
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(row.sha256)
      const body: unknown = JSON.parse(bytes.toString('utf8'))
      if (!object(body)) throw new Error('invalid frozen Max request')
      const result = meter.measure({ body, serialized: writeJsonLossless(body) })
      expect(result).toEqual({ kind: 'estimated', tokens: row.observedPromptTokens })
      const offset = row.observedPromptTokens - row.publicTemplateTokens
      if (row.phase === 'calibration') fit.push(offset)
      else if (row.phase === 'heldout') heldout = offset
      else throw new Error('invalid Max route golden phase')
    }
    expect(fit).toEqual([51, 51, 51])
    expect(heldout).toBe(fit[0])
  })

  it('plans and sends the hosted Max narrow text estimate through the real factory', async () => {
    const modelId = 'qwen/qwen3.8-max-0902'
    const selected = definition(modelId)
    const meter = createQwenInputMeter(selected)
    const host = await fixture(cert.tls, res => res.end(localResponse), {}, undefined, [selected])
    const transport = createPiAiTransport({
      ...host.options,
      definitions: [selected],
      inputMeters: [meter],
    })
    try {
      const input = {
        ...request(modelId),
        messages: [message('user', 'Hi', 'hosted-max-hi')],
        tools: [],
        parameters: { maxOutputTokens: 16 },
      }
      const planned = transport.plan(input)
      if ('rejected' in planned) throw new Error(JSON.stringify(planned))
      expect(planned.planned.inputLimitEvidence.inputTokens).toEqual({
        kind: 'estimated',
        tokens: 62,
      })
      const sent = await transport.send(
        planned.planned,
        'qwen-local-only-credential',
        new AbortController().signal,
      )
      if (!('response' in sent)) throw new Error(JSON.stringify(sent))
      for await (const _event of transport.read(
        sent.response,
        planned.planned,
        new AbortController().signal,
      )) {
        // Consume the bounded local fixture to release its response resource.
      }
      expect(host.requests).toHaveLength(1)
      expect(host.requests[0]?.body).toBe(planned.planned.serialized)
    } finally {
      await transport.close()
      await host.close()
    }
  })

  it('freezes the actual Max planner projection for the original 08 English prompt', () => {
    const modelId = 'qwen/qwen3.8-max-0902'
    const selected = definition(modelId)
    const input = {
      ...request(modelId),
      messages: [message('user', 'Reply with the single word OK.', 'hosted-max-english')],
      tools: [],
      parameters: { maxOutputTokens: 16 },
    }
    const planned = planRequest(input, [selected], createQwenInputMeter(selected))
    if ('rejected' in planned) throw new Error(JSON.stringify(planned))
    const frozen = readFileSync(
      new URL(
        './fixtures/qwen/probe-six/08-qwen3.8-max-0902-english-formal-plan.json',
        import.meta.url,
      ),
      'utf8',
    )
    expect(planned.planned.serialized).toBe(frozen.trimEnd())
  })

  it('uses the independently observed Max text-array and formal input counts only for metering', () => {
    const golden: unknown = JSON.parse(
      readFileSync(
        new URL('./fixtures/qwen/max0902-formal-conversion-golden.json', import.meta.url),
        'utf8',
      ),
    )
    if (!object(golden) || !object(golden.textArrayBridge) || !object(golden.formalInvocation))
      throw new Error('invalid Max conversion golden')
    const bridge = readFileSync(
      new URL(
        './fixtures/qwen/probe-six/08-qwen3.8-max-0902-english-text-array.json',
        import.meta.url,
      ),
    )
    const formal = readFileSync(
      new URL(
        './fixtures/qwen/probe-six/08-qwen3.8-max-0902-english-formal-plan.json',
        import.meta.url,
      ),
    )
    expect(createHash('sha256').update(bridge).digest('hex')).toBe(
      golden.textArrayBridge.wireSha256,
    )
    expect(createHash('sha256').update(formal).digest('hex')).toBe(
      golden.formalInvocation.wireSha256,
    )
    expect(golden.textArrayBridge.promptTokens).toBe(68)
    expect(golden.formalInvocation.promptTokens).toBe(68)
    expect(golden.formalInvocation).toMatchObject({
      usageSource: 'upstream',
      providerEcho: 'Alibaba',
      sendAttempts: 1,
      outcome: 'truncated',
      ending: 'truncated_at_limit',
      outputTokens: 16,
      reasoningTokens: 16,
      rawSseCaptured: false,
    })
    const selected = definition('qwen/qwen3.8-max-0902')
    const body = JSON.parse(formal.toString('utf8'))
    expect(
      createQwenInputMeter(selected).measure({
        body,
        serialized: formal.toString('utf8').trimEnd(),
      }),
    ).toEqual({
      kind: 'estimated',
      tokens: golden.formalInvocation.promptTokens,
    })
  })

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
        algorithmRevision:
          modelId === ids[1] ? 'qwen-38-public-template-image-3' : 'qwen-38-public-template-2',
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

  it.each(ids)('%s matches independent Jinja Unicode and multi-call history golden', modelId => {
    const body = { ...unicodeBody, model: modelId }
    const rendered = renderQwenPrompt(body)
    expect(rendered).toBe(
      readFileSync(
        new URL(
          `./fixtures/qwen/public-template-unicode-${modelId === ids[0] ? '24t' : '27b'}.txt`,
          import.meta.url,
        ),
        'utf8',
      ),
    )
    expect(
      createQwenInputMeter(definition(modelId)).measure({
        body,
        serialized: writeJsonLossless(body),
      }),
    ).toEqual({ kind: 'estimated', tokens: 552 })
  })

  it.each(ids)('%s meters a real final plan with Unicode tool schema', modelId => {
    const selected = definition(modelId)
    const meter = createQwenInputMeter(selected)
    const input = request(modelId)
    const planned = planRequest(
      {
        ...input,
        tools: [{ ...tool, description: '查询 <地点> 🙂' }],
      },
      [selected],
      meter,
    )
    if ('rejected' in planned) throw new Error(JSON.stringify(planned))
    expect(planned.planned.inputLimitEvidence.inputTokens.kind).toBe('estimated')
    expect(planned.planned.serialized).toContain('查询 <地点> 🙂')
    expect(renderQwenPrompt(planned.planned.body)).toContain(
      '\\u67e5\\u8be2 \\u003c\\u5730\\u70b9\\u003e \\ud83d\\ude42',
    )
    expect(
      meter.measure({
        body: planned.planned.body,
        serialized: planned.planned.serialized,
      }),
    ).toEqual(planned.planned.inputLimitEvidence.inputTokens)
  })

  it('rejects a user message consisting only of a wrapped tool response', () => {
    const body = {
      ...unicodeBody,
      messages: [
        { role: 'system', content: 'Answer accurately.' },
        { role: 'user', content: '<tool_response>orphan</tool_response>' },
      ],
    }
    expect(renderQwenPrompt(body)).toBeUndefined()
    expect(
      createQwenInputMeter(definition(ids[0])).measure({
        body,
        serialized: writeJsonLossless(body),
      }),
    ).toEqual({ kind: 'unavailable' })
  })

  it('leaves noncanonical numeric tool JSON unavailable until Python normalization is modeled', () => {
    const body = {
      ...unicodeBody,
      tools: [
        {
          type: 'function',
          function: {
            name: 'lookup',
            parameters: { type: 'object', minimum: 1e-7 },
          },
        },
      ],
    }
    expect(renderQwenPrompt(body)).toBeUndefined()
    expect(
      createQwenInputMeter(definition(ids[0])).measure({
        body,
        serialized: writeJsonLossless(body),
      }),
    ).toEqual({ kind: 'unavailable' })
  })

  it('counts unscaled inline PNG grids from an independent golden, preserving prior images', () => {
    const meter = createQwenInputMeter(definition(ids[1]))
    const golden: unknown = JSON.parse(
      readFileSync(new URL('./fixtures/qwen/unscaled-image-golden.json', import.meta.url), 'utf8'),
    )
    if (!object(golden) || !Array.isArray(golden.images)) throw new Error('invalid image golden')
    const images = golden.images.map(row => {
      if (
        !object(row) ||
        typeof row.file !== 'string' ||
        typeof row.sha256 !== 'string' ||
        typeof row.width !== 'number' ||
        typeof row.height !== 'number' ||
        typeof row.imageTokens !== 'number' ||
        typeof row.templateSupplement !== 'number'
      )
        throw new Error('invalid image golden row')
      const bytes = readFileSync(new URL(`./fixtures/qwen/${row.file}`, import.meta.url))
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(row.sha256)
      expect(qwenUnscaledImageTokens(row.width, row.height)).toBe(row.imageTokens)
      expect(row.imageTokens - 3).toBe(row.templateSupplement)
      return `data:image/png;base64,${bytes.toString('base64')}`
    })
    const [red, blue] = images
    if (!red || !blue) throw new Error('missing image golden')
    const image = (url: string) => ({ type: 'image_url', image_url: { url } })
    const makeBody = (first: string, second: string) => ({
      ...fixtureBody,
      model: ids[1],
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'First image.' }, image(first)] },
        { role: 'assistant', content: 'I saw red.' },
        { role: 'user', content: [{ type: 'text', text: 'Second image.' }, image(second)] },
      ],
    })
    const body = makeBody(red, blue)
    const measure = (input: Parameters<typeof renderQwenPrompt>[0]) =>
      meter.measure({ body: input, serialized: writeJsonLossless(input) })
    const both = measure(body)
    const bothRed = measure(makeBody(red, red))
    const earlierBlue = measure(makeBody(blue, red))
    expect(both.kind).toBe('estimated')
    expect(bothRed.kind).toBe('estimated')
    if (
      both.kind === 'unavailable' ||
      bothRed.kind === 'unavailable' ||
      earlierBlue.kind === 'unavailable'
    )
      throw new Error('image estimate unavailable')
    expect(Number(both.tokens) - Number(bothRed.tokens)).toBe(1026 - 291)
    expect(Number(earlierBlue.tokens) - Number(bothRed.tokens)).toBe(1026 - 291)
    expect(renderQwenPrompt(body)).toContain('<|vision_start|><|image_pad|><|vision_end|>')
    for (const url of ['https://example.invalid/image.png', 'data:image/png;base64,AAAA']) {
      const changed = { ...body, messages: [{ role: 'user', content: [image(url)] }] }
      expect(measure(changed)).toEqual({ kind: 'unavailable' })
    }
    expect(qwenUnscaledImageTokens(10, 10)).toBeUndefined()
    expect(qwenUnscaledImageTokens(4000, 4000)).toBeUndefined()
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

  it('plans and sends the 27B inline image estimate through local TLS', async () => {
    const modelId = ids[1]
    const selected = definition(modelId)
    const meter = createQwenInputMeter(selected)
    const bytes = readFileSync(new URL('./fixtures/qwen/public-red-544.png', import.meta.url))
    const visualTurn = judgedMessage({
      id: 'qwen-visual-turn',
      type: 'user',
      createdAt: at,
      blocks: [
        {
          id: 'qwen-visual-text',
          kind: 'text',
          text: 'Describe this image.',
          visibility: { toHuman: true, toModel: true },
        },
        {
          id: 'qwen-visual-image',
          kind: 'image',
          mediaType: 'image/png',
          data: { inline: bytes.toString('base64') },
          visibility: { toHuman: true, toModel: true },
        },
      ],
    })
    const host = await fixture(cert.tls, res => res.end(localResponse), {}, undefined, [selected])
    const transport = createPiAiTransport({
      ...host.options,
      definitions: [selected],
      inputMeters: [meter],
    })
    try {
      const baseline = request(modelId)
      const input = { ...baseline, messages: [...baseline.messages, visualTurn] }
      const planned = transport.plan(input)
      if ('rejected' in planned) throw new Error(JSON.stringify(planned))
      expect(planned.planned.inputLimitEvidence.inputTokens.kind).toBe('estimated')
      expect(planned.planned.inputLimitEvidence.images).toBe(1)
      expect(planned.planned.inputLimitEvidence.imageBytes).toEqual([bytes.length])
      expect(planned.planned.serialized).toContain('data:image/png;base64,')
      const sent = await transport.send(
        planned.planned,
        'qwen-local-only-credential',
        new AbortController().signal,
      )
      if (!('response' in sent)) throw new Error(JSON.stringify(sent))
      for await (const _event of transport.read(
        sent.response,
        planned.planned,
        new AbortController().signal,
      )) {
        // Drain the bounded local fixture.
      }
      expect(host.requests).toHaveLength(1)
      expect(host.requests[0]?.body).toBe(planned.planned.serialized)
    } finally {
      await transport.close()
      await host.close()
    }
  })

  it('rejects an image needing undocumented resize at the final 27B plan gate', () => {
    const modelId = ids[1]
    const selected = definition(modelId)
    const small = judgedMessage({
      id: 'qwen-small-visual',
      type: 'user',
      createdAt: at,
      blocks: [
        {
          id: 'qwen-small-image',
          kind: 'image',
          mediaType: 'image/png',
          data: {
            inline:
              'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==',
          },
          visibility: { toHuman: true, toModel: true },
        },
      ],
    })
    const baseline = request(modelId)
    expect(
      planRequest(
        { ...baseline, messages: [...baseline.messages, small] },
        [selected],
        createQwenInputMeter(selected),
      ),
    ).toMatchObject({ rejected: 'invalidInput', reason: 'input_size_unavailable' })
  })

  it.each(ids)('%s drops unverified sampling controls before final template metering', modelId => {
    const selected = definition(modelId)
    const meter = createQwenInputMeter(selected)
    const baseline = planRequest(request(modelId), [selected], meter)
    const withSampling = planRequest(
      {
        ...request(modelId),
        parameters: {
          maxOutputTokens: 64,
          temperature: 0.5,
          topP: 0.8,
          seed: 7,
        },
      },
      [selected],
      meter,
    )
    if ('rejected' in baseline || 'rejected' in withSampling)
      throw new Error('official Qwen final plan unavailable')
    expect(withSampling.planned.body).toEqual(baseline.planned.body)
    expect(withSampling.planned.inputLimitEvidence.inputTokens).toEqual(
      baseline.planned.inputLimitEvidence.inputTokens,
    )
    expect(withSampling.planned.droppedParameters).toEqual(
      expect.arrayContaining(['temperature', 'topP', 'seed']),
    )
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
        expect(planned.planned.body.messages).toHaveLength(6)
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
        expect(host.requests[0]?.body).toContain('value=42')
        expect(host.requests[0]?.body).toContain('Need an exact lookup.')
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

  it.each(unboundCommercial)(
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
        expect(host.requests[0]?.body).toContain('value=42')
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
