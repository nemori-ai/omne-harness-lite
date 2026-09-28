import { testDefinitions } from './definitions.ts'
import { describe, expect, it } from 'vitest'
import {
  LosslessNumber,
  readJsonStrict,
  writeJsonLossless,
} from '@omne-harness-lite/content-blocks'
import { canonicalInteger, generatedCallId } from '@omne-harness-lite/pi-ai-transport'
import { planRequest } from './synthetic-input-meter.ts'
import { input, message, judgedMessage } from './support.ts'

function plan(request = input()) {
  const result = planRequest(request, testDefinitions)
  if ('rejected' in result) throw new Error(result.rejected)
  return result.planned
}
function parsed(text: string) {
  const value = readJsonStrict(text)
  if ('failed' in value) throw new Error(value.failed)
  return value.ok
}
describe('S57 exact pilot binding and wire projection', () => {
  it('maps OpenAI reminders to developer and compaction independently to user', () => {
    const request = input()
    const result = plan({
      ...request,
      messages: [...request.messages, message('compaction', 'summary')],
    })
    expect(result.body.messages).toMatchObject([
      { role: 'system' },
      { role: 'developer' },
      { role: 'user' },
      { role: 'user' },
    ])
    expect(result.serialized).toContain('system_reminder')
    expect(result.serialized).toContain('compaction')
    expect(result.body.provider).toEqual({
      order: ['openai'],
      allow_fallbacks: false,
      require_parameters: true,
    })
    expect(result.serialized).not.toContain('cache_control')
    for (const key of ['user', 'session_id', 'prompt_cache_key', 'models', 'route'])
      expect(result.body).not.toHaveProperty(key)
  })
  it('maps Anthropic reminders to user and uses the explicit supplied TTL', () => {
    const result = plan(input(true))
    expect(result.body.messages).toMatchObject([
      { role: 'system', content: [{ cache_control: { type: 'ephemeral', ttl: '1h' } }] },
      { role: 'user' },
      { role: 'user', content: [{ cache_control: { ttl: '1h' } }] },
    ])
    expect(result.serialized).not.toContain('developer')
  })
  it.each([
    {},
    { cache: { mode: 'explicit' } },
    { cache: { mode: 'explicit', ttl: 'short', breakpoints: ['system'] } },
    { cache: { mode: 'explicit', ttl: '5m', breakpoints: ['system', 'system'] } },
    { cache: { mode: 'automatic' } },
  ])('rejects uninterpretable explicit cache config without defaulting', values => {
    const request = input(true)
    expect(
      planRequest(
        {
          ...request,
          snapshot: {
            ...request.snapshot,
            adaptation: {
              ...request.snapshot.adaptation,
              configuration: { revision: 'c2', values },
            },
          },
        },
        testDefinitions,
      ),
    ).toEqual({ rejected: 'invalidInput', reason: 'malformed' })
  })
  it('never guesses a definition from a model prefix or substitutes another revision', () => {
    const request = input()
    const adaptation = request.snapshot.adaptation
    expect(
      planRequest(
        {
          ...request,
          snapshot: {
            ...request.snapshot,
            adaptation: {
              ...adaptation,
              implementation: { ...adaptation.implementation, revision: 'not-installed' },
            },
          },
        },
        testDefinitions,
      ),
    ).toEqual({ rejected: 'unavailable' })
    expect(
      planRequest(
        {
          ...request,
          routeName: 'openai/not-listed',
          snapshot: {
            ...request.snapshot,
            adaptation: {
              ...adaptation,
              definition: { modelId: 'openai/not-listed', revision: '1' },
            },
          },
        },
        testDefinitions,
      ),
    ).toEqual({ rejected: 'unavailable' })
  })
  it('preserves decimal spellings and drops protected overrides before send', () => {
    const request = input()
    const result = plan({
      ...request,
      parameters: {
        temperature: new LosslessNumber('0.123456789012345678901'),
        reasoningEffort: 'max',
        extra: {
          provider: { allow_fallbacks: true },
          user: 'session-secret',
          model: 'other',
          metadata: { large: new LosslessNumber('9007199254740993') },
        },
      },
    })
    expect(result.droppedParameters).toEqual(['reasoningEffort', 'model', 'provider', 'user'])
    expect(result.parameters).not.toHaveProperty('reasoningEffort')
    expect(result.parameters.extra).not.toHaveProperty('provider')
    expect(result.serialized).toContain('0.123456789012345678901')
    expect(result.serialized).toContain('9007199254740993')
    expect(result.serialized).not.toContain('session-secret')
    expect(Object.isFrozen(result.parameters.extra)).toBe(true)
  })
  it('copies nested input and freezes the wire body before the caller can change it', () => {
    const request = input()
    const extra = { nested: { value: 'original' } }
    const result = plan({ ...request, parameters: { extra } })
    const before = result.serialized
    extra.nested.value = 'changed'
    expect(writeJsonLossless(result.body)).toBe(before)
    expect(result.parameters.extra).toEqual({ nested: { value: 'original' } })
    expect(Object.isFrozen(result.body)).toBe(true)
  })
  it('sends raw malformed completed tool arguments and normalizes paired ids consistently', () => {
    const blocks = [
      {
        id: 'callblock',
        kind: 'tool_call',
        callId: 'call with spaces',
        tool: 'lookup',
        complete: true,
        unparseable: true,
        rawArguments: '{"x":',
        visibility: { toHuman: true, toModel: true },
      },
    ]
    const assistant = judgedMessage({
      id: 'assistant1',
      type: 'assistant',
      response: 'response1',
      ending: 'complete',
      createdAt: '2026-09-27T00:00:00Z',
      blocks,
    })
    const tool = judgedMessage({
      id: 'tool1',
      type: 'tool',
      callId: 'call with spaces',
      createdAt: '2026-09-27T00:00:00Z',
      blocks: [
        {
          id: 'result1',
          kind: 'tool_result',
          callId: 'call with spaces',
          outcome: 'completed',
          visibility: { toHuman: true, toModel: true },
          blocks: [
            {
              id: 'resulttext',
              kind: 'text',
              text: 'ok',
              visibility: { toHuman: true, toModel: true },
            },
          ],
        },
      ],
    })
    const result = plan({ ...input(), messages: [assistant, tool] })
    expect(result.body.messages).toMatchObject([
      { tool_calls: [{ id: expect.stringMatching(/^call_/), function: { arguments: '{"x":' } }] },
      { role: 'tool', tool_call_id: expect.stringMatching(/^call_/), content: 'ok' },
    ])
    expect(planRequest({ ...input(), messages: [assistant] }, testDefinitions)).toEqual({
      rejected: 'orphan_tool_call',
    })
  })
  it('uses canonical numeric dispatch/index keys without losing large integers', () => {
    expect(canonicalInteger(new LosslessNumber('1.0'))).toBe('1e0')
    expect(generatedCallId('c', new LosslessNumber('1e0'), new LosslessNumber('10'))).toBe(
      generatedCallId('c', 1, new LosslessNumber('1e1')),
    )
    expect(canonicalInteger(new LosslessNumber('9007199254740993'))).toBe('9007199254740993e0')
    expect(canonicalInteger(new LosslessNumber('1e400'))).toBe('1e400')
    expect(writeJsonLossless(parsed('{"index":9007199254740993}'))).toContain('9007199254740993')
  })
})
