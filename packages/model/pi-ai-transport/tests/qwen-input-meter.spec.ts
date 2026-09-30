import { testImagePreparerFor, imagePreparation } from './image-transport-support.ts'
import { directFull, directNew } from './direct-full-input.ts'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { invokeModel, type PlanInput } from '@omne-harness-lite/model-request-runtime'
import type { ModelToolEntry } from '@omne-harness-lite/tool-definition'
import { createOfficialProfileContent, interpretConfiguration } from '../src/configuration.ts'
import { createPiAiTransport } from '../src/transport.ts'
import { planRequest } from '../src/plan.ts'
import { object } from '../src/json.ts'
import {
  createQwenInputMeter,
  qwenUnscaledImageTokens,
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
  policy,
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
    calibration: { kind: 'none' as const, reason: 'no_observation' as const },
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
  it.each(commercial)(
    '%s counts the complete visible history with a new exact binding',
    async modelId => {
      const selected = definition(modelId),
        meter = createQwenInputMeter(selected)
      expect(selected.revision).toBe('3')
      expect(selected.implementation.revision).toBe('mp4-17')
      expect(meter.algorithmRevision).toBe(
        `${modelId.slice('qwen/'.length)}-final-visible-json-proxy-1`,
      )
      expect(() => createQwenInputMeter({ ...selected, revision: '1' })).toThrow(TypeError)
      const planned = await planRequest(
        await request(modelId),
        [selected],
        meter,
        {
          signal: new AbortController().signal,
        },
        testImagePreparerFor(planRequest),
      )
      if ('rejected' in planned) throw new Error(JSON.stringify(planned))
      expect(planned.planned.inputLimitEvidence.inputTokens.kind).toBe('estimated')
      const body = planned.planned.body,
        serialized = planned.planned.serialized
      const baseline = directFull(meter, { body, serialized })
      expect(baseline.kind).toBe('estimated')
      for (const original of [
        'lookup__exact',
        'value=42',
        'system_reminder',
        'Need an exact lookup.',
      ]) {
        expect(serialized).toContain(original)
        const changed = JSON.parse(
          serialized.replace(original, 'INDEPENDENT_LONG_VALUE_'.repeat(20)),
        )
        const measured = directFull(meter, {
          body: changed,
          serialized: writeJsonLossless(changed),
        })
        expect(measured.kind).toBe('estimated')
        expect(measured).not.toEqual(baseline)
      }
      expect(directFull(meter, { body, serialized: '{}' })).toEqual({ kind: 'unavailable' })
      expect(
        directNew(meter, {
          units: body.messages instanceof Array ? body.messages : [],
          envelope: { model: modelId },
          precedingUnitCount: 0,
        }),
      ).toEqual({ kind: 'unavailable' })
    },
  )

  it.each(commercial)(
    '%s rejects unaccounted media/opaque/fields without deleting history',
    async modelId => {
      const selected = definition(modelId),
        meter = createQwenInputMeter(selected)
      const planned = await planRequest(
        await request(modelId),
        [selected],
        meter,
        {
          signal: new AbortController().signal,
        },
        testImagePreparerFor(planRequest),
      )
      if ('rejected' in planned) throw new Error(JSON.stringify(planned))
      const body = planned.planned.body
      for (const extra of [
        {
          role: 'user',
          content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }],
        },
        {
          role: 'assistant',
          content: '',
          reasoning_details: [{ type: 'reasoning.encrypted', data: 'ciphertext' }],
        },
        {
          role: 'assistant',
          content: '',
          reasoning_details: [{ type: 'reasoning.text', text: 'known', unknown: true }],
        },
        { role: 'user', content: 'unknown member', hidden_context: 'unaccounted' },
      ]) {
        const changed = {
          ...body,
          messages: [...(Array.isArray(body.messages) ? body.messages : []), extra],
        }
        const serialized = writeJsonLossless(changed)
        expect(directFull(meter, { body: changed, serialized })).toEqual({ kind: 'unavailable' })
        expect(writeJsonLossless(changed)).toBe(serialized)
      }
      const wrongProvider = {
        ...body,
        provider: { order: ['elsewhere'], allow_fallbacks: false, require_parameters: true },
      }
      expect(
        directFull(meter, { body: wrongProvider, serialized: writeJsonLossless(wrongProvider) }),
      ).toEqual({ kind: 'unavailable' })
      const fallback = {
        ...body,
        provider: { order: ['alibaba'], allow_fallbacks: true, require_parameters: true },
      }
      expect(
        directFull(meter, { body: fallback, serialized: writeJsonLossless(fallback) }),
      ).toEqual({ kind: 'unavailable' })
    },
  )

  it.each(commercial)(
    '%s invokes three visible rounds with real meter and complete prior tool history',
    async modelId => {
      const selected = definition(modelId),
        meter = createQwenInputMeter(selected)
      const host = await fixture(cert.tls, res => res.end(localResponse), {}, undefined, [selected])
      const transport = createPiAiTransport({
        ...host.options,
        definitions: [selected],
        inputMeters: [meter],
      })
      let input = await request(modelId)
      try {
        for (let round = 0; round < 3; round++) {
          const planned = await transport.plan(input, { signal: new AbortController().signal })
          if ('rejected' in planned) throw new Error(JSON.stringify(planned))
          expect(planned.planned.measurement.mode).toBe('full')
          const result = await invokeModel({
            ...input,
            transport,
            credential: 'local-qwen-visible-only',
            signal: new AbortController().signal,
            policy: policy(),
            onAccepted: () => {},
          }).outcome
          if (!('outcome' in result) || result.outcome !== 'complete')
            throw new Error(JSON.stringify(result))
          expect(writeJsonLossless(result.usage)).toContain('"input_tokens":76')
          expect(host.requests[round]?.body).toBe(planned.planned.serialized)
          expect(host.requests[round]?.body).toContain('Need an exact lookup.')
          expect(host.requests[round]?.body).toContain('value=42')
          expect(planned.planned.serialized.includes('cache_control')).toBe(
            selected.routes.alibaba?.cache.mode === 'explicit',
          )
          const reply = judgedMessage({
            type: 'assistant',
            id: `visible-answer-${round}`,
            response: `visible-response-${round}`,
            ending: 'complete',
            createdAt: at,
            blocks: result.blocks,
          })
          input = {
            ...input,
            calibration: {
              kind: 'observation',
              inputCalibration: result.inputCalibration,
              usage: result.usage,
              outputBlocks: result.blocks,
              replaySelection: result.blocks.map((_block, sourceBlockIndex) => ({
                sourceBlockIndex,
                messageIndex: input.messages.length,
                blockIndex: sourceBlockIndex,
              })),
            },
            messages: [...input.messages, reply, message('user', `Next ${round}`, `next-${round}`)],
          }
        }
        expect(host.requests).toHaveLength(3)
      } finally {
        await transport.close()
        await host.close()
      }
    },
  )

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
      const result = directFull(meter, { body, serialized })
      expect(meter).toMatchObject({
        modelId,
        definitionRevision: selected.revision,
        implementation: selected.implementation,
        provider: 'alibaba',
        algorithmRevision:
          modelId === ids[1]
            ? 'qwen-38-public-template-image-effort-4'
            : 'qwen-38-public-template-effort-3',
      })
      expect(selected).toMatchObject({
        revision: '3',
        implementation: { name: 'pi-ai:qwen', revision: 'mp4-18' },
      })
      expect(meter.evidence).toContain('no actual effort holdout or error bound')
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
      expect(directFull(meter, { body, serialized: '{}' })).toEqual({ kind: 'unavailable' })
      const differentOutputCap = { ...body, max_tokens: 128 }
      expect(
        directFull(meter, {
          body: differentOutputCap,
          serialized: writeJsonLossless(differentOutputCap),
        }),
      ).toEqual(result)
      expect(() => createQwenInputMeter({ ...selected, revision: 'other' })).toThrow(TypeError)
      expect(() =>
        createQwenInputMeter({
          ...selected,
          revision: '2',
          implementation: { name: 'pi-ai:qwen', revision: 'mp4-17' },
        }),
      ).toThrow(TypeError)
    },
  )

  it('changes the estimate when tool schema, tool result, reminder, or prior reasoning changes', () => {
    const meter = createQwenInputMeter(definition(ids[0]))
    const original = writeJsonLossless(fixtureBody)
    const originalResult = directFull(meter, { body: fixtureBody, serialized: original })
    if (originalResult.kind === 'unavailable') throw new Error('golden unavailable')
    for (const text of ['lookup__exact', 'value=42', 'Review the exact value.', 'Need a lookup.']) {
      const changed = original.replace(text, '')
      const body = JSON.parse(changed)
      if (!object(body)) throw new Error('invalid altered fixture')
      const result = directFull(meter, { body, serialized: changed })
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
      directFull(createQwenInputMeter(definition(modelId)), {
        body,
        serialized: writeJsonLossless(body),
      }),
    ).toEqual({ kind: 'estimated', tokens: 552 })
  })

  it.each(ids)('%s meters a real final plan with Unicode tool schema', async modelId => {
    const selected = definition(modelId)
    const meter = createQwenInputMeter(selected)
    const input = await request(modelId)
    const planned = await planRequest(
      {
        ...input,
        tools: [{ ...tool, description: '查询 <地点> 🙂' }],
      },
      [selected],
      meter,
      { signal: new AbortController().signal },
      testImagePreparerFor(planRequest),
    )
    if ('rejected' in planned) throw new Error(JSON.stringify(planned))
    expect(planned.planned.inputLimitEvidence.inputTokens.kind).toBe('estimated')
    expect(planned.planned.serialized).toContain('查询 <地点> 🙂')
    expect(renderQwenPrompt(planned.planned.body)).toContain(
      '\\u67e5\\u8be2 \\u003c\\u5730\\u70b9\\u003e \\ud83d\\ude42',
    )
    expect(
      directFull(meter, {
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
      directFull(createQwenInputMeter(definition(ids[0])), {
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
      directFull(createQwenInputMeter(definition(ids[0])), {
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
      directFull(meter, { body: input, serialized: writeJsonLossless(input) })
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

  it.each(ids)(
    '%s estimates declared high/max effort with the default xhigh template frame',
    async modelId => {
      const meter = createQwenInputMeter(definition(modelId))
      const omitted = { ...fixtureBody, model: modelId }
      const baseline = directFull(meter, { body: omitted, serialized: writeJsonLossless(omitted) })
      expect(baseline).toEqual({ kind: 'estimated', tokens: 397 })
      for (const effort of ['high', 'max'] as const) {
        const body = { ...omitted, reasoning: { effort } }
        expect(directFull(meter, { body, serialized: writeJsonLossless(body) })).toEqual(baseline)
        const planned = await planRequest(
          {
            ...(await request(modelId)),
            parameters: { maxOutputTokens: 64, reasoningEffort: effort },
          },
          [definition(modelId)],
          meter,
          { signal: new AbortController().signal },
          testImagePreparerFor(planRequest),
        )
        if ('rejected' in planned) throw new Error(JSON.stringify(planned))
        expect(planned.planned.body.reasoning).toEqual({ effort })
        expect(planned.planned.measurement).toMatchObject({
          mode: 'full',
          fullContribution: { precision: 'estimated' },
        })
        const unset = await planRequest(
          await request(modelId),
          [definition(modelId)],
          meter,
          { signal: new AbortController().signal },
          testImagePreparerFor(planRequest),
        )
        if ('rejected' in unset) throw new Error(JSON.stringify(unset))
        // Only the effort member differs on the wire; the template frame is unchanged.
        expect(planned.planned.inputLimitEvidence.inputTokens).toEqual(
          unset.planned.inputLimitEvidence.inputTokens,
        )
      }
      for (const reasoning of [
        { effort: 'none' },
        { effort: 'medium' },
        { effort: 'xhigh' },
        { effort: 'high', summary: 'auto' },
        { enabled: true },
        { effort: 1 },
        'high',
        null,
      ]) {
        const body = { ...omitted, reasoning }
        expect(directFull(meter, { body, serialized: writeJsonLossless(body) })).toEqual({
          kind: 'unavailable',
        })
      }
    },
  )

  it('keeps 27B thinking-disabled effort unavailable instead of inventing a template frame', async () => {
    const modelId = ids[1]
    const selected = definition(modelId)
    const meter = createQwenInputMeter(selected)
    const planned = await planRequest(
      { ...(await request(modelId)), parameters: { maxOutputTokens: 64, reasoningEffort: 'none' } },
      [selected],
      meter,
      { signal: new AbortController().signal },
      testImagePreparerFor(planRequest),
    )
    expect(planned).toMatchObject({ rejected: 'invalidInput', reason: 'input_size_unavailable' })
  })

  it('does not admit an effort the exact 2.4T route never forwards', () => {
    const selected = definition(ids[0])
    const route = selected.routes.alibaba
    if (!route) throw new Error('missing fixed Alibaba route')
    const narrowed = {
      ...selected,
      routes: {
        alibaba: {
          ...route,
          parameters: {
            ...route.parameters,
            reasoningEffort: {
              kind: 'select' as const,
              accepted: { values: ['max' as const] },
              otherwise: { drop: true as const },
            },
          },
        },
      },
    }
    const meter = createQwenInputMeter(narrowed)
    const body = { ...fixtureBody, model: ids[0], reasoning: { effort: 'high' } }
    expect(directFull(meter, { body, serialized: writeJsonLossless(body) })).toEqual({
      kind: 'unavailable',
    })
    const max = { ...body, reasoning: { effort: 'max' } }
    expect(directFull(meter, { body: max, serialized: writeJsonLossless(max) })).toEqual({
      kind: 'estimated',
      tokens: 397,
    })
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
      const baseline = await request(modelId)
      const input = { ...baseline, messages: [...baseline.messages, visualTurn] }
      const planned = await transport.plan(input, { signal: new AbortController().signal })
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

  it('rejects an image needing undocumented resize at the final 27B plan gate', async () => {
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
              'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
          },
          visibility: { toHuman: true, toModel: true },
        },
      ],
    })
    const baseline = await request(modelId)
    expect(
      await planRequest(
        { ...baseline, messages: [...baseline.messages, small] },
        [selected],
        createQwenInputMeter(selected),
        { signal: new AbortController().signal },
        testImagePreparerFor(planRequest),
      ),
    ).toMatchObject({ rejected: 'invalidInput', reason: 'input_size_unavailable' })
  })

  it.each(ids)(
    '%s drops unverified sampling controls before final template metering',
    async modelId => {
      const selected = definition(modelId)
      const meter = createQwenInputMeter(selected)
      const baseline = await planRequest(
        await request(modelId),
        [selected],
        meter,
        {
          signal: new AbortController().signal,
        },
        testImagePreparerFor(planRequest),
      )
      const withSampling = await planRequest(
        {
          ...(await request(modelId)),
          parameters: {
            maxOutputTokens: 64,
            temperature: 0.5,
            topP: 0.8,
            seed: 7,
          },
        },
        [selected],
        meter,
        { signal: new AbortController().signal },
        testImagePreparerFor(planRequest),
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
    },
  )

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
        const planned = await transport.plan(await request(modelId), {
          signal: new AbortController().signal,
        })
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
        expect(
          await planRequest(
            await request(modelId),
            [selected],
            meter,
            {
              signal: new AbortController().signal,
            },
            testImagePreparerFor(planRequest),
          ),
        ).toHaveProperty('planned')
      } finally {
        await transport.close()
        await host.close()
      }
    },
  )
})
