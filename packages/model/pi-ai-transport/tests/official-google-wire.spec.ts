import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import type { PlanInput } from '@omne-harness-lite/model-request-runtime'
import type { ModelToolEntry } from '@omne-harness-lite/tool-definition'
import { createOfficialProfileContent, planRequest } from '@omne-harness-lite/pi-ai-transport'
import { googleDefinitions } from '../src/official-models/google.ts'
import { certificate, content, finish, fixture, judgedMessage, message, sse } from './support.ts'

const at = '2026-09-28T00:00:00Z'
const provider = 'google-ai-studio'
const visible = { toHuman: true, toModel: true }
const tinyPng =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg=='
const tool: ModelToolEntry = {
  name: 'lookup__google',
  description: 'Look up a value',
  parameters: {
    type: 'object',
    properties: { key: { type: 'string' } },
    required: ['key'],
    additionalProperties: false,
  },
}

function request(definition: (typeof googleDefinitions)[number]): PlanInput {
  const profile = createOfficialProfileContent(definition, {
    providers: [provider],
    allowFallback: false,
    configuration: { revision: '1', values: { cache: { mode: 'automatic' } } },
  })
  if ('rejected' in profile) throw new Error(profile.rejected)
  return {
    tokenMargin: { multiplier: 1.2, reserveTokens: 32 },
    target: {
      kind: 'model_call',
      callId: unwrap(parseOpaqueIdentifier('google-wire-call', 'ModelCallId')),
      dispatch: 1,
    },
    routeName: definition.modelId,
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
    parameters: { reasoningEffort: 'medium', maxOutputTokens: 64 },
    messages: [
      message('system', 'instruction'),
      message('system_reminder', 'continue'),
      judgedMessage({
        id: 'google-assistant',
        type: 'assistant',
        response: 'google-response',
        ending: 'complete',
        createdAt: at,
        blocks: [
          { id: 'google-thought', kind: 'thinking', text: 'consider lookup', visibility: visible },
          {
            id: 'google-call',
            kind: 'tool_call',
            callId: 'google tool call',
            tool: tool.name,
            complete: true,
            arguments: { key: 'x' },
            visibility: visible,
          },
        ],
      }),
      judgedMessage({
        id: 'google-result',
        type: 'tool',
        callId: 'google tool call',
        createdAt: at,
        blocks: [
          {
            id: 'google-result-block',
            kind: 'tool_result',
            callId: 'google tool call',
            outcome: 'completed',
            visibility: visible,
            blocks: [
              { id: 'google-result-text', kind: 'text', text: 'found', visibility: visible },
            ],
          },
        ],
      }),
      judgedMessage({
        id: 'google-user-image',
        type: 'user',
        createdAt: at,
        blocks: [
          { id: 'google-question', kind: 'text', text: 'describe', visibility: visible },
          {
            id: 'google-image',
            kind: 'image',
            mediaType: 'image/png',
            data: { inline: tinyPng },
            visibility: visible,
          },
        ],
      }),
    ],
    tools: [tool],
  }
}

let cert: ReturnType<typeof certificate>
beforeAll(() => {
  cert = certificate()
})
afterAll(() => cert.dispose())

describe('Google official routes: controlled wire projection only', () => {
  it.each(googleDefinitions)(
    '$modelId cannot plan without a model-applicable meter',
    definition => {
      expect(planRequest(request(definition), googleDefinitions)).toEqual({
        rejected: 'unavailable',
      })
    },
  )

  it.each(googleDefinitions)(
    '$modelId preserves official binding and final body over local TLS',
    async definition => {
      // The shared HTTPS fixture injects a synthetic one-token meter. This is
      // a projection test, not evidence that Gemini input counting is solved.
      const host = await fixture(
        cert.tls,
        res =>
          res.end(
            content('ok') +
              sse({
                choices: [],
                usage: {
                  prompt_tokens: 100,
                  completion_tokens: 3,
                  prompt_tokens_details: { cached_tokens: 20, cache_write_tokens: 0 },
                },
              }) +
              finish(),
          ),
        {},
        undefined,
        [definition],
      )
      try {
        const planned = host.transport.plan(request(definition))
        if ('rejected' in planned) throw new Error(planned.rejected)
        const { body, serialized, inputLimitEvidence } = planned.planned
        expect(body.model).toBe(definition.modelId)
        expect(body.provider).toEqual({
          order: [provider],
          allow_fallbacks: false,
          require_parameters: true,
        })
        expect(body.reasoning).toEqual({ effort: 'medium' })
        expect(body.max_tokens).toBe(64)
        expect(body.tools).toEqual([{ type: 'function', function: tool }])
        expect(body.messages).toMatchObject([
          { role: 'system' },
          {
            role: 'user',
            content: [{ text: '[system_reminder "system_reminder"]' }, { text: 'continue' }],
          },
          {
            role: 'assistant',
            reasoning: 'consider lookup',
            tool_calls: [{ function: { name: tool.name, arguments: '{"key":"x"}' } }],
          },
          { role: 'tool', content: 'found' },
          { role: 'user', content: [{ text: 'describe' }, { type: 'image_url' }] },
        ])
        expect(serialized).not.toContain('cache_control')
        expect(serialized).not.toContain('ttl')
        expect(inputLimitEvidence.requestBytes).toBe(Buffer.byteLength(serialized, 'utf8'))
        expect(inputLimitEvidence.imageBytes).toEqual([70])
        expect(inputLimitEvidence.images).toBe(1)

        const sent = await host.transport.send(
          planned.planned,
          'google-offline-test-credential',
          new AbortController().signal,
        )
        if (!('response' in sent)) throw new Error('controlled response unavailable')
        const events = []
        for await (const event of host.transport.read(
          sent.response,
          planned.planned,
          new AbortController().signal,
        ))
          events.push(event)
        expect(events).toContainEqual(expect.objectContaining({ t: 'fill', payload: 'ok' }))
        const accounts = events.filter(event => event.t === 'account')
        expect(accounts).toHaveLength(1)
        const account = accounts[0]
        if (!account || account.usage.input_tokens === 'unknown')
          throw new Error('upstream input usage missing')
        expect(ExactDecimal.from(account.usage.input_tokens).compare(ExactDecimal.from(80))).toBe(0)
        const accounted = writeJsonLossless(account)
        for (const fact of [
          '"output_tokens":3',
          '"cache_read_tokens":20',
          '"cache_write_tokens":0',
          '"source":"upstream"',
        ])
          expect(accounted).toContain(fact)
        expect(host.requests).toHaveLength(1)
        expect(host.requests[0]?.body).toBe(serialized)
      } finally {
        await host.close()
      }
    },
  )

  it.each(googleDefinitions)('$modelId rejects raw audio before any plan is signed', definition => {
    const input = request(definition)
    const audio = judgedMessage({
      id: 'google-audio',
      type: 'user',
      createdAt: at,
      blocks: [
        {
          id: 'google-voice',
          kind: 'voice',
          mediaType: 'audio/pcm',
          data: { inline: 'eA==' },
          visibility: visible,
        },
      ],
    })
    expect(planRequest({ ...input, messages: [...input.messages, audio] }, [definition])).toEqual({
      rejected: 'modality_not_carried',
    })
  })

  it.each(googleDefinitions)('$modelId rejects video without a wire projection', definition => {
    const input = request(definition)
    const video = judgedMessage({
      id: 'google-video',
      type: 'user',
      createdAt: at,
      blocks: [
        {
          id: 'google-video-file',
          kind: 'file',
          attachment: {
            storage: 'attachments',
            key: 'obj_google_video',
            mediaType: 'video/mp4',
            name: 'clip.mp4',
          },
          visibility: visible,
        },
      ],
    })
    expect(planRequest({ ...input, messages: [...input.messages, video] }, [definition])).toEqual({
      rejected: 'modality_not_carried',
    })
  })
})
