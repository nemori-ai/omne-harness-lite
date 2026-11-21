import { describe, expect, it } from 'vitest'
import { writeJsonText } from '@omne-harness/json-text'
import type { Parameter, TransportFailure } from '@omne-harness/model-contract'
import type { PiMaterializedMedia } from '@omne-harness/pi-ai-transport'
import { recordAdoption } from '@omne-harness/pi-ai-transport'
import { QWEN_OWNER } from '@omne-harness/pi-ai-qwen'
import {
  assembledOf,
  bindingOf,
  encodeInput,
  fixedRequest,
  message,
  officialProfile,
  RECORD,
  speechBlock,
  speechRead,
  SPEECH_BYTES,
  stateBlock,
  supplierOf,
  textBlock,
  thinkingBlock,
  tool,
  type RequestParts,
} from './support/qwen.ts'

const ADAPTER = recordAdoption(QWEN_OWNER, RECORD)

async function plan(parameters: readonly Parameter[]) {
  const binding = await bindingOf()
  const outcome = binding.rules.plan({
    profile: officialProfile(),
    supplier: supplierOf(),
    assembled: { ...assembledOf(fixedRequest()), parameters },
  })
  await binding.release()
  return outcome
}

async function encoded(
  parts: RequestParts,
  media: readonly PiMaterializedMedia[] = [],
): Promise<{ body: unknown } | { failure: TransportFailure }> {
  const binding = await bindingOf()
  const outcome = binding.encode(encodeInput(fixedRequest(parts), media))
  await binding.release()
  return 'ok' in outcome
    ? { body: JSON.parse(writeJsonText(outcome.ok.body)) }
    : { failure: outcome.failure }
}

describe('parameters', () => {
  it.each(['low', 'medium', 'high', 'max'] as const)(
    'passes the effort %s and writes it as itself',
    async value => {
      const outcome = await plan([{ kind: 'reasoning-effort', value }])
      expect(outcome).toMatchObject({
        ok: { parameters: [{ applied: { kind: 'reasoning-effort', value } }] },
      })
      expect(await encoded({ parameters: [{ kind: 'reasoning-effort', value }] })).toMatchObject({
        body: { reasoning: { effort: value } },
      })
    },
  )

  it.each([
    { kind: 'reasoning-effort', value: 'none' },
    { kind: 'temperature', value: 0.5 },
    { kind: 'top-p', value: 0.5 },
    { kind: 'stop', value: ['END'] },
    { kind: 'seed', value: '7' },
    { kind: 'frequency-penalty', value: 0 },
    { kind: 'presence-penalty', value: 0 },
  ] satisfies readonly Parameter[])(
    'refuses $kind $value before sending, never drops it',
    async parameter => {
      expect(await plan([parameter])).toEqual({
        failure: { kind: 'unsupported', field: parameter.kind, adapter: ADAPTER },
      })
    },
  )

  it('writes the output limit as max_tokens up to 131072 and refuses one above it', async () => {
    expect(
      await encoded({ parameters: [{ kind: 'max-output-tokens', value: '131072' }] }),
    ).toMatchObject({ body: { max_tokens: 131072 } })
    expect(await plan([{ kind: 'max-output-tokens', value: '131073' }])).toEqual({
      failure: { kind: 'invalid', field: 'max-output-tokens', reason: 'out-of-range' },
    })
  })
})

describe('tool choice', () => {
  const tools = [tool('lookup')]

  it.each(['auto', 'none'] as const)('sends %s', async choice => {
    expect(await encoded({ tools, toolChoice: choice })).toMatchObject({
      body: { tool_choice: choice },
    })
  })

  it.each([['required'], [{ name: 'lookup' }]] as const)(
    'refuses the forced choice %j before sending',
    async choice => {
      expect(await encoded({ tools, toolChoice: choice })).toEqual({
        failure: { kind: 'unsupported', field: 'toolChoice', adapter: ADAPTER },
      })
    },
  )
})

describe('request body', () => {
  it('pins Alibaba, writes the instruction as a system message and plain text compactly, with no fixed field', async () => {
    const outcome = await encoded({
      system: [textBlock('s1', 'be brief')],
      messages: [message('u1', 'user', [textBlock('b1', 'hello')])],
    })
    expect(outcome).toMatchObject({
      body: {
        model: 'qwen/qwen3.8-omni-flash',
        provider: { order: ['alibaba'] },
        messages: [
          { role: 'system', content: 'be brief' },
          { role: 'user', content: 'hello' },
        ],
      },
    })
    expect(outcome).not.toHaveProperty('body.store')
  })

  it('sends the speech it hears as input_audio in WAV, the original bytes', async () => {
    const outcome = await encoded(
      { messages: [message('u1', 'user', [textBlock('b1', 'hear this'), speechBlock('b2')])] },
      [speechRead()],
    )
    expect(outcome).toMatchObject({
      body: {
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'hear this' },
              {
                type: 'input_audio',
                input_audio: { data: Buffer.from(SPEECH_BYTES).toString('base64'), format: 'wav' },
              },
            ],
          },
        ],
      },
    })
  })
})

describe('reasoning carried back', () => {
  const PAYLOAD =
    '{"format":"unknown","index":0,"text":"Oslo is at 59.9 N.","type":"reasoning.text"}'
  const scope = 'openrouter/qwen/qwen3.8-omni-flash'

  it('writes a state of its own format back as the reasoning_details item it came from', async () => {
    const outcome = await encoded({
      messages: [
        message('u1', 'user', [textBlock('b1', 'which is further north?')]),
        message(
          'a1',
          'assistant',
          [
            thinkingBlock('k1', 'Oslo is at 59.9 N.'),
            textBlock('t1', 'Oslo'),
            stateBlock('s1', PAYLOAD, ['k1']),
          ],
          { replay: { scope, format: 'qwen-reasoning-text-v1', at: [2] } },
        ),
        message('u2', 'user', [textBlock('b2', 'ok')]),
      ],
    })
    expect(outcome).toMatchObject({
      body: {
        messages: [
          { role: 'user', content: 'which is further north?' },
          { role: 'assistant', content: 'Oslo', reasoning_details: [JSON.parse(PAYLOAD)] },
          { role: 'user', content: 'ok' },
        ],
      },
    })
  })

  it('refuses a state of its format that is not a reasoning text item', async () => {
    const outcome = await encoded({
      messages: [
        message('u1', 'user', [textBlock('b1', 'q')]),
        message(
          'a1',
          'assistant',
          [textBlock('t1', 'a'), stateBlock('s1', '{"type":"reasoning.encrypted","data":"x"}')],
          {
            replay: { scope, format: 'qwen-reasoning-text-v1', at: [1] },
          },
        ),
        message('u2', 'user', [textBlock('b2', 'ok')]),
      ],
    })
    expect(outcome).toEqual({
      failure: { kind: 'invalid', field: 'reasoning_state', reason: 'payload-not-replayable' },
    })
  })
})
