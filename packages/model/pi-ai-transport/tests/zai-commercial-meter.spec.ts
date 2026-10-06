import { testImagePreparerFor, imagePreparation } from './image-transport-support.ts'
import { directFull } from './direct-full-input.ts'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  readJsonStrict,
  toOpaqueJson,
  writeJsonLossless,
  type JsonObject,
} from '@omne-harness-lite/content-blocks'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import { judgeMessage, type Message } from '@omne-harness-lite/messages'
import { invokeModel } from '@omne-harness-lite/model-request-runtime-local'
import type { PlanInput } from '@omne-harness-lite/model-request-runtime'
import type { ModelToolEntry } from '@omne-harness-lite/tool-definition'
import { createOfficialProfileContent } from '../src/configuration.ts'
import {
  createZaiCommercialInputMeter,
  renderZaiCommercialPrompt,
} from '../src/input-meters/zai-commercial.ts'
import type { InputMeter } from '@omne-harness-lite/model-request-runtime'
import { object } from '../src/json.ts'
import { zaiDefinitions } from '../src/official-models/zai.ts'
import { planRequest } from '../src/plan.ts'
import { createPiAiTransport } from '../src/transport.ts'
import { certificate, finish, fixture, policy, sse } from './support.ts'

const at = '2026-09-28T00:00:00Z'
const ids = ['z-ai/glm-5.3-prime', 'z-ai/glm-5.3-flashx'] as const
let cert: ReturnType<typeof certificate>
beforeAll(() => {
  cert = certificate()
})
afterAll(() => cert.dispose())
const rawGoldens: unknown = JSON.parse(
  readFileSync(new URL('./fixtures/zai/commercial-usage-goldens.json', import.meta.url), 'utf8'),
)
if (!Array.isArray(rawGoldens) || rawGoldens.length !== 8)
  throw new Error('missing independent selected-route golden wires')

function definition(modelId: string) {
  const found = zaiDefinitions.find(item => item.modelId === modelId)
  if (!found) throw new Error(`missing ZAI definition: ${modelId}`)
  return found
}

function measured(body: JsonObject) {
  return directFull(createZaiCommercialInputMeter(definition(String(body.model))), {
    body,
    serialized: writeJsonLossless(body),
  })
}

function message(raw: unknown): Message {
  const judged = judgeMessage(raw)
  if ('rejected' in judged) throw new Error(judged.rejected)
  return judged.ok
}

function publicInput(
  modelId: (typeof ids)[number],
  margin = { multiplier: 1.2, reserveTokens: 32 },
): PlanInput {
  const selected = definition(modelId)
  const prime = modelId === 'z-ai/glm-5.3-prime'
  const provider = prime ? 'alibaba' : 'z-ai/fp8'
  const configuration = {
    revision: '1',
    values: {
      cache: prime
        ? { mode: 'explicit', ttl: '5m', breakpoints: ['last_message'] }
        : { mode: 'automatic' },
    },
  }
  const profile = createOfficialProfileContent(selected, {
    providers: [provider],
    allowFallback: false,
    configuration,
  })
  if ('rejected' in profile) throw new Error(profile.rejected)
  const visible = { toHuman: true, toModel: true }
  const tool: ModelToolEntry = {
    name: 'lookup',
    description: 'Return a number',
    parameters: { type: 'object', properties: { value: { type: 'integer' } }, required: ['value'] },
  }
  const history = [
    message({
      type: 'system_reminder',
      id: 'reminder',
      createdAt: at,
      nature: 'event',
      source: { kind: 'attempt_started', attempt: 1, reason: 'first', at },
      blocks: [
        { id: 'r-text', kind: 'text', text: 'Preserve the lookup result.', visibility: visible },
      ],
    }),
    message({
      type: 'user',
      id: 'user-one',
      createdAt: at,
      blocks: [{ id: 'u1-text', kind: 'text', text: 'Compute 17 times 19.', visibility: visible }],
    }),
    message({
      type: 'assistant',
      id: 'assistant',
      response: 'response-one',
      ending: 'complete',
      createdAt: at,
      blocks: [
        { id: 'answer', kind: 'text', text: 'The value is 323.', visibility: visible },
        {
          id: 'call',
          kind: 'tool_call',
          callId: 'lookup-1',
          tool: 'lookup',
          complete: true,
          arguments: { value: 17 },
          visibility: visible,
        },
      ],
    }),
    message({
      type: 'tool',
      id: 'tool-result',
      callId: 'lookup-1',
      createdAt: at,
      blocks: [
        {
          id: 'result',
          kind: 'tool_result',
          callId: 'lookup-1',
          outcome: 'completed',
          visibility: visible,
          blocks: [{ id: 'result-text', kind: 'text', text: '17 × 19 = 323', visibility: visible }],
        },
      ],
    }),
    message({
      type: 'user',
      id: 'user-two',
      createdAt: at,
      blocks: [{ id: 'u2-text', kind: 'text', text: 'What was the result?', visibility: visible }],
    }),
  ]
  return {
    calibration: { kind: 'none' as const, reason: 'no_observation' as const },
    outputHistory: [],
    tokenMargin: margin,
    target: {
      kind: 'model_call',
      callId: unwrap(parseOpaqueIdentifier('zai-commercial-test', 'ModelCallId')),
      dispatch: 1,
    },
    routeName: modelId,
    provider,
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
    parameters: { maxOutputTokens: 64 },
    messages: history,
    tools: [tool],
  }
}

describe('ZAI Prime/FlashX narrow selected-route estimates', () => {
  it('rejects retired meter coordinates, including the refusing mp4-17 releases', () => {
    expect(() =>
      createZaiCommercialInputMeter({
        ...definition('z-ai/glm-5.3-prime'),
        revision: '1',
        implementation: { name: 'pi-ai:zai', revision: 'mp4-1' },
      }),
    ).toThrow('unsupported')
    for (const [modelId, revision] of [
      ['z-ai/glm-5.3-prime', '3'],
      ['z-ai/glm-5.3-flashx', '2'],
    ] as const) {
      expect(definition(modelId).implementation).toEqual({ name: 'pi-ai:zai', revision: 'mp4-18' })
      for (const implementation of ['mp4-17', 'mp4-18'])
        expect(() =>
          createZaiCommercialInputMeter({
            ...definition(modelId),
            revision,
            implementation: { name: 'pi-ai:zai', revision: implementation },
          }),
        ).toThrow('unsupported')
    }
  })

  it('matches eight independent fit/holdout usage counts from frozen real request wires', () => {
    for (const raw of rawGoldens) {
      if (
        !object(raw) ||
        !object(raw.request) ||
        typeof raw.id !== 'string' ||
        typeof raw.requestSha256 !== 'string' ||
        typeof raw.promptTokens !== 'number'
      )
        throw new Error('invalid commercial golden')
      expect(createHash('sha256').update(JSON.stringify(raw.request)).digest('hex')).toBe(
        raw.requestSha256,
      )
      expect(measured(raw.request)).toEqual({ kind: 'estimated', tokens: raw.promptTokens })
    }
  })

  it.each(ids)('%s plans complete text/tool history with caller margin', async modelId => {
    const input = publicInput(modelId)
    const planned = await planRequest(
      input,
      [definition(modelId)],
      createZaiCommercialInputMeter(definition(modelId)),
      { signal: new AbortController().signal },
      testImagePreparerFor(planRequest),
    )
    if ('rejected' in planned) throw new Error(JSON.stringify(planned))
    const { body, serialized, inputLimitEvidence } = planned.planned
    expect(serialized).toBe(writeJsonLossless(body))
    expect(body.messages).toMatchObject([
      { role: 'user' },
      { role: 'user' },
      { role: 'assistant', tool_calls: [{ function: { name: 'lookup' } }] },
      { role: 'tool', tool_call_id: 'lookup-1' },
      { role: 'user' },
    ])
    expect(inputLimitEvidence.inputTokens).toMatchObject({ kind: 'estimated' })
    expect(inputLimitEvidence.tokenMargin).toEqual(input.tokenMargin)
    if (
      inputLimitEvidence.inputTokens.kind !== 'estimated' ||
      typeof inputLimitEvidence.inputTokens.tokens !== 'number'
    )
      throw new Error('missing estimated input tokens')
    expect(inputLimitEvidence.admissionTokens).toBe(
      Math.ceil(inputLimitEvidence.inputTokens.tokens * 1.2) + 32,
    )
    expect(serialized.includes('17 × 19 = 323')).toBe(true)
    expect(serialized.includes('cache_control')).toBe(modelId === 'z-ai/glm-5.3-prime')
  })

  it.each(ids)('%s refuses an estimated cap breach with estimated metadata', async modelId => {
    const input = publicInput(modelId, { multiplier: 10000, reserveTokens: 0 })
    const result = await planRequest(
      input,
      [definition(modelId)],
      createZaiCommercialInputMeter(definition(modelId)),
      { signal: new AbortController().signal },
      testImagePreparerFor(planRequest),
    )
    expect(result).toMatchObject({
      rejected: 'invalidInput',
      reason: 'input_limit_exceeded',
      metric: 'maxInputTokens',
      basis: 'estimated',
    })
  })

  it.each(ids)(
    '%s estimates plain reasoning history and retains an unexplained detail on rejection',
    async modelId => {
      const selected = definition(modelId)
      const original = createZaiCommercialInputMeter(selected)
      for (const opaque of [false, true]) {
        const input = publicInput(modelId)
        const thought = 'I checked all prior context.'
        const assistant = message({
          type: 'assistant',
          id: 'assistant',
          response: 'response-one',
          ending: 'complete',
          createdAt: at,
          blocks: [
            {
              id: 'thinking',
              kind: 'thinking',
              text: thought,
              ...(opaque
                ? {
                    opaque: toOpaqueJson({
                      routeName: modelId,
                      reasoning_details: [{ type: 'reasoning.text', text: thought, index: 0 }],
                    }),
                  }
                : {}),
              visibility: { toHuman: false, toModel: true },
            },
            {
              id: 'answer',
              kind: 'text',
              text: 'The value is 323.',
              visibility: { toHuman: true, toModel: true },
            },
            {
              id: 'call',
              kind: 'tool_call',
              callId: 'lookup-1',
              tool: 'lookup',
              complete: true,
              arguments: { value: 17 },
              visibility: { toHuman: true, toModel: true },
            },
          ],
        })
        let finalBody: JsonObject | undefined
        const observing: InputMeter = {
          ...original,
          measureFull(request) {
            finalBody = request.body
            return original.measureFull(request)
          },
        }
        const result = await planRequest(
          {
            ...input,
            messages: input.messages.map((item, index) => (index === 2 ? assistant : item)),
          },
          [selected],
          observing,
          { signal: new AbortController().signal },
          testImagePreparerFor(planRequest),
        )
        // The plain string reaches the template slot; the detail lacks the captured four-key
        // shape (no `format`), so it stays unexplained and is refused without stripping history.
        if (opaque)
          expect(result).toEqual({
            rejected: 'invalidInput',
            reason: 'input_size_unavailable',
            metrics: ['maxInputTokens'],
          })
        else
          expect(result).toMatchObject({
            planned: { measurement: { mode: 'full', precision: 'estimated' } },
          })
        expect(finalBody?.messages).toMatchObject([
          { role: 'user' },
          { role: 'user' },
          {
            role: 'assistant',
            content: 'The value is 323.',
            ...(opaque
              ? { reasoning_details: [{ type: 'reasoning.text', text: thought, index: 0 }] }
              : { reasoning: thought }),
          },
          { role: 'tool' },
          { role: 'user' },
        ])
      }
    },
  )

  it.each([
    ...(['low', 'high', 'max'] as const).map(effort => ({
      modelId: 'z-ai/glm-5.3-prime' as const,
      effort,
    })),
    { modelId: 'z-ai/glm-5.3-flashx' as const, effort: undefined },
  ])(
    '$modelId $effort sends the fixed planned wire over local TLS and keeps actual usage',
    async ({ modelId, effort }) => {
      const selected = definition(modelId)
      const meter = createZaiCommercialInputMeter(selected)
      const base = publicInput(modelId)
      const input = {
        ...base,
        parameters: { ...base.parameters, ...(effort ? { reasoningEffort: effort } : {}) },
      }
      const planned = await planRequest(
        input,
        [selected],
        meter,
        {
          signal: new AbortController().signal,
        },
        testImagePreparerFor(planRequest),
      )
      if ('rejected' in planned) throw new Error(JSON.stringify(planned))
      if (effort) {
        expect(planned.planned.body.reasoning).toEqual({ effort })
        expect(renderZaiCommercialPrompt(planned.planned.body, 'visible')).toContain(
          `Reasoning Effort: ${effort[0]?.toUpperCase()}${effort.slice(1)}`,
        )
      }
      const host = await fixture(
        cert.tls,
        response => {
          response.writeHead(200, { 'content-type': 'text/event-stream' })
          response.end(
            sse({ choices: [{ delta: { content: '323.' } }] }) +
              sse({
                choices: [],
                usage: {
                  prompt_tokens: 999,
                  completion_tokens: 2,
                  prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
                },
              }) +
              finish(),
          )
        },
        {},
        undefined,
        [selected],
      )
      const transport = createPiAiTransport({
        ...host.options,
        definitions: [selected],
        inputMeters: [meter],
      })
      try {
        const result = await invokeModel({
          ...input,
          transport,
          credential: 'offline-test-credential',
          signal: new AbortController().signal,
          policy: policy(),
        }).outcome
        if (!('outcome' in result)) throw new Error(JSON.stringify(result))
        expect(result.outcome).toBe('complete')
        if (result.usage.input_tokens === 'unknown') throw new Error('missing upstream input usage')
        expect(ExactDecimal.from(result.usage.input_tokens).compare(ExactDecimal.from(999))).toBe(0)
        expect(host.requests).toHaveLength(1)
        const sent = host.requests[0]
        if (!sent) throw new Error('missing local TLS capture')
        expect(sent.body).toBe(planned.planned.serialized)
        const parsed = readJsonStrict(sent.body)
        if (!('ok' in parsed)) throw new Error('invalid final wire')
        expect(parsed.ok).toMatchObject({
          model: modelId,
          provider: {
            order: [modelId === 'z-ai/glm-5.3-prime' ? 'alibaba' : 'z-ai/fp8'],
            allow_fallbacks: false,
            require_parameters: true,
          },
        })
        expect(sent.body.includes('cache_control')).toBe(modelId === 'z-ai/glm-5.3-prime')
        expect(sent.body).toContain('17 × 19 = 323')
      } finally {
        await transport.close()
        await host.close()
      }
    },
  )

  it('refuses unproven reasoning/media/protocol and mismatched binding or bytes', () => {
    for (const modelId of ids) {
      const provider = modelId === 'z-ai/glm-5.3-prime' ? 'alibaba' : 'z-ai/fp8'
      const body: JsonObject = {
        model: modelId,
        provider: { order: [provider], allow_fallbacks: false, require_parameters: true },
        stream: true,
        store: false,
        messages: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
      }
      expect(measured(body).kind).toBe('estimated')
      for (const reasoning of [
        {},
        { effort: 'medium' },
        { effort: 'none' },
        { effort: 1 },
        { effort: 'low', extra: true },
      ])
        expect(measured({ ...body, reasoning })).toEqual({ kind: 'unavailable' })
      if (modelId === 'z-ai/glm-5.3-flashx')
        expect(measured({ ...body, reasoning: { effort: 'high' } })).toEqual({
          kind: 'unavailable',
        })
      expect(
        measured({
          ...body,
          messages: [{ role: 'assistant', content: 'ok', reasoning: 'private' }],
        }).kind,
      ).toBe('estimated')
      expect(
        measured({
          ...body,
          messages: [{ role: 'assistant', content: 'ok', reasoning: null }],
        }),
      ).toEqual({ kind: 'unavailable' })
      expect(
        measured({
          ...body,
          messages: [
            {
              role: 'assistant',
              content: 'ok',
              reasoning_details: [{ type: 'reasoning.text', text: 'private' }],
            },
          ],
        }),
      ).toEqual({ kind: 'unavailable' })
      expect(
        measured({
          ...body,
          messages: [
            {
              role: 'user',
              content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }],
            },
          ],
        }),
      ).toEqual({ kind: 'unavailable' })
      expect(measured({ ...body, unknown_prompt_field: 'unsafe' })).toEqual({ kind: 'unavailable' })
      expect(
        measured({
          ...body,
          provider: { order: ['other'], allow_fallbacks: false, require_parameters: true },
        }),
      ).toEqual({ kind: 'unavailable' })
      expect(
        directFull(createZaiCommercialInputMeter(definition(modelId)), { body, serialized: '{}' }),
      ).toEqual({ kind: 'unavailable' })
      const otherId = modelId === ids[0] ? ids[1] : ids[0]
      expect(
        directFull(createZaiCommercialInputMeter(definition(otherId)), {
          body,
          serialized: writeJsonLossless(body),
        }),
      ).toEqual({ kind: 'unavailable' })
      expect(() =>
        createZaiCommercialInputMeter({ ...definition(modelId), revision: 'not-current' }),
      ).toThrow(TypeError)
      expect(() => createZaiCommercialInputMeter({ ...definition(modelId), routes: {} })).toThrow(
        TypeError,
      )
      if (provider === 'alibaba') {
        const finalMessage = {
          role: 'user',
          content: [
            { type: 'text', text: 'Hello', cache_control: { type: 'ephemeral', ttl: '1h' } },
          ],
        }
        expect(measured({ ...body, messages: [finalMessage] })).toEqual({ kind: 'unavailable' })
      } else {
        const finalMessage = {
          role: 'user',
          content: [
            { type: 'text', text: 'Hello', cache_control: { type: 'ephemeral', ttl: '5m' } },
          ],
        }
        expect(measured({ ...body, messages: [finalMessage] })).toEqual({ kind: 'unavailable' })
      }
    }
  })
})
