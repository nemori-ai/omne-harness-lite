import { testImagePreparerFor } from './image-transport-support.ts'
import { directFull } from './direct-full-input.ts'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { writeJsonLossless, type JsonObject } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import { judgeMessage } from '@omne-harness-lite/messages'
import type { PlanInput } from '@omne-harness-lite/model-request-runtime-local'
import { createOfficialProfileContent } from '../src/configuration.ts'
import { createGlm53InputMeter, renderGlm53Prompt } from '../src/input-meters/zai-glm53.ts'
import { zaiDefinitions } from '../src/official-models/zai.ts'
import { planRequest } from '../src/plan.ts'

const definitions = zaiDefinitions.filter(item =>
  ['z-ai/glm-5.3', 'z-ai/glm-5.3-flash'].includes(item.modelId),
)
const at = '2026-09-28T00:00:00Z'

function definition(modelId: string) {
  const found = definitions.find(item => item.modelId === modelId)
  if (!found) throw new Error(`missing GLM-5.3 definition: ${modelId}`)
  return found
}

async function actualPlan(modelId: string, effort?: 'low' | 'high' | 'max') {
  const selected = definition(modelId)
  const configuration = { revision: '1', values: { cache: { mode: 'automatic' } } }
  const profile = createOfficialProfileContent(selected, {
    providers: ['z-ai/fp8'],
    allowFallback: false,
    configuration,
  })
  if ('rejected' in profile) throw new Error(profile.rejected)
  const raw = {
    type: 'system_reminder',
    id: 'reminder',
    createdAt: at,
    nature: 'event',
    source: { kind: 'attempt_started', attempt: 1, reason: 'first', at },
    blocks: [
      {
        id: 'reminder-text',
        kind: 'text',
        text: 'Continue',
        visibility: { toHuman: true, toModel: true },
      },
    ],
  }
  const reminder = judgeMessage(raw)
  if ('rejected' in reminder) throw new Error(reminder.rejected)
  const user = judgeMessage({
    type: 'user',
    id: 'user',
    createdAt: at,
    blocks: [
      {
        id: 'user-text',
        kind: 'text',
        text: 'Hello 世界',
        visibility: { toHuman: true, toModel: true },
      },
    ],
  })
  if ('rejected' in user) throw new Error(user.rejected)
  const input: PlanInput = {
    calibration: { kind: 'none' as const, reason: 'no_observation' as const },
    outputHistory: [],
    tokenMargin: { multiplier: 1.2, reserveTokens: 32 },
    target: {
      kind: 'model_call',
      callId: unwrap(parseOpaqueIdentifier('glm53-meter-test', 'ModelCallId')),
      dispatch: 1,
    },
    routeName: selected.modelId,
    provider: 'z-ai/fp8',
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
    parameters: { maxOutputTokens: 64, ...(effort ? { reasoningEffort: effort } : {}) },
    messages: [reminder.ok, user.ok],
    tools: [],
  }
  return await planRequest(
    input,
    [selected],
    createGlm53InputMeter(selected),
    {
      signal: new AbortController().signal,
    },
    testImagePreparerFor(planRequest),
  )
}

function measured(modelId: string, body: JsonObject) {
  return directFull(createGlm53InputMeter(definition(modelId)), {
    body,
    serialized: writeJsonLossless(body),
  })
}

describe('Z.AI GLM-5.3 and Flash pinned public-template estimates', () => {
  it('matches independent pinned Jinja goldens, including reverse tool results and low effort', () => {
    const messages = [
      { role: 'system', content: [{ type: 'text', text: 'Be helpful' }] },
      { role: 'user', content: [{ type: 'text', text: 'Use tools' }] },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          { id: 'a', type: 'function', function: { name: 'lookup', arguments: '{"q":"a"}' } },
          { id: 'b', type: 'function', function: { name: 'lookup', arguments: '{"q":"b"}' } },
        ],
      },
      { role: 'tool', tool_call_id: 'b', content: 'B' },
      { role: 'tool', tool_call_id: 'a', content: 'A' },
      { role: 'user', content: [{ type: 'text', text: 'Done' }] },
    ]
    const tools = [
      {
        type: 'function',
        function: {
          name: 'lookup',
          description: 'Find',
          parameters: { type: 'object', properties: { q: { type: 'string' } } },
        },
      },
    ]
    const standard = { model: 'z-ai/glm-5.3', messages, tools }
    const prompt = renderGlm53Prompt(standard, false, 'refuse')
    expect(
      createHash('sha256')
        .update(prompt ?? '')
        .digest('hex'),
    ).toBe('5345eddccee6e2f361762a929cbecc979330f55795f74488b86cecf93ac1dcdc')
    expect(prompt).toContain(
      '<|observation|><tool_response>A</tool_response><tool_response>B</tool_response>',
    )
    expect(
      createHash('sha256')
        .update(
          renderGlm53Prompt({ ...standard, reasoning: { effort: 'low' } }, false, 'refuse') ?? '',
        )
        .digest('hex'),
    ).toBe('de28a1454d5dcfe5aac18a373df6be002463373da8195739029b80c9b68edb88')
    expect(measured(standard.model, standard).kind).toBe('estimated')
    const flash = { ...standard, model: 'z-ai/glm-5.3-flash' }
    expect(
      createHash('sha256')
        .update(renderGlm53Prompt(flash, true, 'refuse') ?? '')
        .digest('hex'),
    ).toBe('5345eddccee6e2f361762a929cbecc979330f55795f74488b86cecf93ac1dcdc')
    expect(measured(flash.model, flash).kind).toBe('estimated')
  })

  it.each(['z-ai/glm-5.3', 'z-ai/glm-5.3-flash'])(
    '%s plans final text/reminder wire with real meter',
    async modelId => {
      const plan = await actualPlan(modelId, modelId.endsWith('flash') ? undefined : 'high')
      if ('rejected' in plan) throw new Error(JSON.stringify(plan))
      expect(plan.planned.body.messages).toMatchObject([
        { role: 'user', content: [{ text: '[system_reminder "reminder"]' }, { text: 'Continue' }] },
        { role: 'user' },
      ])
      expect(plan.planned.inputLimitEvidence).toMatchObject({ inputTokens: { kind: 'estimated' } })
      expect(plan.planned.serialized).toBe(writeJsonLossless(plan.planned.body))
    },
  )

  it('returns unavailable for unsupported multimodal, opaque reasoning and extra fields', () => {
    for (const modelId of ['z-ai/glm-5.3', 'z-ai/glm-5.3-flash']) {
      const body = { model: modelId, messages: [{ role: 'user', content: 'Hello' }] }
      expect(
        measured(modelId, {
          ...body,
          messages: [
            {
              role: 'user',
              content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }],
            },
          ],
        }),
      ).toEqual({ kind: 'unavailable' })
      // Released at mp4-18 after ZV0: a plain reasoning string is visible history; opaque
      // details and `reasoning_content` stay unavailable.
      expect(
        measured(modelId, {
          ...body,
          messages: [{ role: 'assistant', content: 'Hello', reasoning: 'secret' }],
        }),
      ).toMatchObject({ kind: 'estimated' })
      for (const extra of [
        {
          reasoning_details: [
            { type: 'reasoning.encrypted', data: 'OPAQUE', format: 'unknown', index: 0 },
          ],
        },
        { reasoning_content: 'secret' },
      ])
        expect(
          measured(modelId, {
            ...body,
            messages: [{ role: 'assistant', content: 'Hello', ...extra }],
          }),
        ).toEqual({ kind: 'unavailable' })
      expect(measured(modelId, { ...body, unknown_prompt_field: 'test' })).toEqual({
        kind: 'unavailable',
      })
    }
    expect(() =>
      createGlm53InputMeter({ ...definition('z-ai/glm-5.3'), modelId: 'z-ai/glm-5.3-prime' }),
    ).toThrow(TypeError)
    expect(() =>
      createGlm53InputMeter({
        ...definition('z-ai/glm-5.3-flash'),
        modelId: 'z-ai/glm-5.3-flashx',
      }),
    ).toThrow(TypeError)
    // Only the current exported release (3 / mp4-18) binds; the retired refusing release,
    // any mixed or unpublished coordinate throws at construction.
    for (const modelId of ['z-ai/glm-5.3', 'z-ai/glm-5.3-flash'])
      for (const coordinates of [
        { revision: '2', implementation: { name: 'pi-ai:zai', revision: 'mp4-17' } },
        { revision: '3', implementation: { name: 'pi-ai:zai', revision: 'mp4-17' } },
        { revision: '2', implementation: { name: 'pi-ai:zai', revision: 'mp4-18' } },
        { revision: '4', implementation: { name: 'pi-ai:zai', revision: 'mp4-18' } },
        { revision: '1', implementation: { name: 'pi-ai:zai', revision: 'mp4-1' } },
      ])
        expect(() => createGlm53InputMeter({ ...definition(modelId), ...coordinates })).toThrow(
          TypeError,
        )
  })
})
