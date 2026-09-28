import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { writeJsonLossless, type JsonObject } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import { judgeMessage, type Message } from '@omne-harness-lite/messages'
import type { PlanInput } from '@omne-harness-lite/model-request-runtime'
import type { ModelToolEntry } from '@omne-harness-lite/tool-definition'
import { createOfficialProfileContent } from '../src/configuration.ts'
import { createGlm52InputMeter, renderGlm52Prompt } from '../src/input-meters/zai-glm52.ts'
import { zaiDefinitions } from '../src/official-models/zai.ts'
import { planRequest } from '../src/plan.ts'

const model = (() => {
  const found = zaiDefinitions.find(item => item.modelId === 'z-ai/glm-5.2')
  if (!found) throw new Error('missing GLM-5.2 definition')
  return found
})()
const at = '2026-09-28T00:00:00Z'

function message(raw: unknown): Message {
  const judged = judgeMessage(raw)
  if ('rejected' in judged) throw new Error(judged.rejected)
  return judged.ok
}

function text(type: 'system' | 'user' | 'system_reminder', id: string, value: string): Message {
  return message({
    type,
    id,
    createdAt: at,
    blocks: [
      { id: `${id}-text`, kind: 'text', text: value, visibility: { toHuman: true, toModel: true } },
    ],
    ...(type === 'system_reminder'
      ? { nature: 'event', source: { kind: 'attempt_started', attempt: 1, reason: 'first', at } }
      : {}),
  })
}

function planInput(messages: readonly Message[], tools: PlanInput['tools'] = []): PlanInput {
  const provider = 'z-ai/fp8'
  const configuration = { revision: '1', values: { cache: { mode: 'automatic' } } }
  const profile = createOfficialProfileContent(model, {
    providers: [provider],
    allowFallback: false,
    configuration,
  })
  if ('rejected' in profile) throw new Error(profile.rejected)
  return {
    tokenMargin: { multiplier: 1.2, reserveTokens: 32 },
    target: {
      kind: 'model_call',
      callId: unwrap(parseOpaqueIdentifier('glm52-meter-test', 'ModelCallId')),
      dispatch: 1,
    },
    routeName: model.modelId,
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
    messages,
    tools,
  }
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function measured(body: JsonObject) {
  return createGlm52InputMeter(model).measure({ body, serialized: writeJsonLossless(body) })
}

describe('Z.AI GLM-5.2 pinned public-template estimate', () => {
  it('reproduces the independent upstream Jinja text and tool/multiturn golden prompts', () => {
    const simple = {
      model: model.modelId,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Hello 世界' }] }],
    }
    const simplePrompt = renderGlm52Prompt(simple)
    expect(simplePrompt).toBe(
      '[gMASK]<sop><|system|>Reasoning Effort: Max<|user|>Hello 世界<|assistant|><think>',
    )
    expect(measured(simple)).toEqual({ kind: 'estimated', tokens: 14 })

    const body = {
      model: model.modelId,
      messages: [
        { role: 'system', content: [{ type: 'text', text: 'Be helpful' }] },
        { role: 'user', content: [{ type: 'text', text: 'Use tool' }] },
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            { id: 'c', type: 'function', function: { name: 'lookup', arguments: '{"q":"x"}' } },
          ],
        },
        { role: 'tool', tool_call_id: 'c', content: 'ok' },
        { role: 'user', content: [{ type: 'text', text: 'Done' }] },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'lookup',
            description: 'Find',
            parameters: { type: 'object', properties: { q: { type: 'string' } } },
          },
        },
      ],
    }
    const prompt = renderGlm52Prompt(body)
    expect(prompt).toBeDefined()
    expect(digest(prompt ?? '')).toBe(
      'b228004f593761373debfb32b6e47815709d5fc47f9b8e66c7c7c7b579471461',
    )
    expect(measured(body).kind).toBe('estimated')
    expect(measured({ ...body, tools: [] })).not.toEqual(measured(body))
    expect(
      measured({ ...body, messages: body.messages.filter(item => item.role !== 'tool') }),
    ).not.toEqual(measured(body))
  })

  it('plans the actual official route with a marked reminder and measured final body', () => {
    const meter = createGlm52InputMeter(model)
    const input = planInput([
      text('system', 's', 'Be concise'),
      text('system_reminder', 'r', 'Continue the current task'),
      text('user', 'u', 'Hello 世界'),
    ])
    const result = planRequest(input, [model], meter)
    if ('rejected' in result) throw new Error(JSON.stringify(result))
    expect(result.planned.body.messages).toMatchObject([
      { role: 'system' },
      {
        role: 'user',
        content: [{ text: '[system_reminder "r"]' }, { text: 'Continue the current task' }],
      },
      { role: 'user' },
    ])
    expect(result.planned.inputLimitEvidence).toMatchObject({
      inputTokens: { kind: 'estimated' },
    })
    expect(result.planned.serialized).toBe(writeJsonLossless(result.planned.body))
  })

  it('meters an actual planned tool call, result, schema and following user turn', () => {
    const tool: ModelToolEntry = {
      name: 'lookup',
      description: 'Find an exact value',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
        additionalProperties: false,
      },
    }
    const assistant = message({
      type: 'assistant',
      id: 'a',
      response: 'response-1',
      ending: 'complete',
      createdAt: at,
      blocks: [
        {
          id: 'call-block',
          kind: 'tool_call',
          callId: 'call_1',
          tool: 'lookup',
          complete: true,
          arguments: { query: 'value' },
          visibility: { toHuman: true, toModel: true },
        },
      ],
    })
    const resultMessage = message({
      type: 'tool',
      id: 't',
      callId: 'call_1',
      createdAt: at,
      blocks: [
        {
          id: 'result-block',
          kind: 'tool_result',
          callId: 'call_1',
          outcome: 'completed',
          visibility: { toHuman: true, toModel: true },
          blocks: [
            {
              id: 'result-text',
              kind: 'text',
              text: 'value=42',
              visibility: { toHuman: true, toModel: true },
            },
          ],
        },
      ],
    })
    const request = planInput(
      [text('user', 'u1', 'Look up value'), assistant, resultMessage, text('user', 'u2', 'Done?')],
      [tool],
    )
    const planned = planRequest(request, [model], createGlm52InputMeter(model))
    if ('rejected' in planned) throw new Error(JSON.stringify(planned))
    const prompt = renderGlm52Prompt(planned.planned.body)
    expect(prompt).toContain(
      '<tool_call>lookup<arg_key>query</arg_key><arg_value>value</arg_value></tool_call>',
    )
    expect(prompt).toContain('<|observation|><tool_response>value=42</tool_response>')
    expect(prompt).toContain('"required": ["query"]')
    expect(planned.planned.inputLimitEvidence).toMatchObject({
      inputTokens: { kind: 'estimated' },
    })
  })

  it('refuses inputs that the public template cannot account for and rejects mismatched bindings', () => {
    const body = {
      model: model.modelId,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
    }
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
    expect(
      measured({
        ...body,
        messages: [{ role: 'assistant', content: 'ok', reasoning_details: [{ type: 'opaque' }] }],
      }),
    ).toEqual({ kind: 'unavailable' })
    expect(
      measured({
        ...body,
        messages: [
          {
            role: 'assistant',
            content: '',
            tool_calls: [
              { id: 'c', type: 'function', function: { name: 'lookup', arguments: '{"x":' } },
            ],
          },
        ],
      }),
    ).toEqual({ kind: 'unavailable' })
    expect(measured({ ...body, unrecognized_input: 'hello' })).toEqual({ kind: 'unavailable' })
    expect(createGlm52InputMeter(model).measure({ body, serialized: '{}' })).toEqual({
      kind: 'unavailable',
    })
    expect(() => createGlm52InputMeter({ ...model, revision: '2' })).toThrow(TypeError)
    expect(() => createGlm52InputMeter({ ...model, routes: {} })).toThrow(TypeError)
  })
})
