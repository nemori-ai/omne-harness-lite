// Cross-family replay, OpenAI side (spec D7, #465 C4): a history built as pure data holds an
// assistant message that an Anthropic model produced. Encoding for an OpenAI record leaves its
// reasoning out and omits its thinking; the replay projection names it in its diagnostics; the
// OpenAI message of the same history carries its state. The Anthropic family is not imported.
import { describe, expect, it } from 'vitest'
import { writeJsonText } from '@omne-harness/json-text'
import { projectReplay, judgeReplayDeclaration } from '@omne-harness/model-contract'
import {
  bindingOf,
  fixedRequest,
  message,
  recordNamed,
  stateBlock,
  textBlock,
  thinkingBlock,
} from './support/openai.ts'

const SOL = recordNamed('openai/gpt-5.6-sol')
const OPENAI_PAYLOAD =
  '{"data":"openai-cipher","format":"openai-responses-v1","id":"rs_1","type":"reasoning.encrypted"}'
const ANTHROPIC_SCOPE = 'openrouter/anthropic/claude-sonnet-5'

const HISTORY = [
  message('u1', 'user', [textBlock('b1', 'first question')]),
  message('a1', 'assistant', [textBlock('t1', 'openai answer'), stateBlock('s1', OPENAI_PAYLOAD)], {
    replay: { scope: 'openrouter/openai/gpt-5.6-sol', format: 'openai-responses-v1', at: [1] },
  }),
  message('u2', 'user', [textBlock('b2', 'second question')]),
  message(
    'a2',
    'assistant',
    [
      thinkingBlock('k1', 'claude private thinking'),
      textBlock('t2', 'claude answer'),
      stateBlock('s2', 'claude-signed-group', ['k1']),
    ],
    { replay: { scope: ANTHROPIC_SCOPE, format: 'anthropic-claude-v1', at: [2] } },
  ),
  message('u3', 'user', [textBlock('b3', 'third question')]),
]

describe('an Anthropic message in an OpenAI request', () => {
  it('leaves the foreign state and thinking out and carries the OpenAI state', async () => {
    const binding = await bindingOf(SOL)
    const request = fixedRequest(SOL, { messages: HISTORY })
    const encoded = binding.encode({ request, media: [] })
    if (!('ok' in encoded)) throw new Error(JSON.stringify(encoded.failure))
    const body: unknown = JSON.parse(writeJsonText(encoded.ok.body))
    expect(body).toMatchObject({
      messages: [
        { role: 'user', content: 'first question' },
        { role: 'assistant', content: 'openai answer', reasoning_details: [JSON.parse(OPENAI_PAYLOAD)] },
        { role: 'user', content: 'second question' },
        { role: 'assistant', content: 'claude answer' },
        { role: 'user', content: 'third question' },
      ],
    })
    const text = writeJsonText(encoded.ok.body)
    expect(text).not.toContain('claude-signed-group')
    expect(text).not.toContain('claude private thinking')
    await binding.release()
  })

  it('the replay projection of the record names the foreign message in its diagnostics', () => {
    const request = fixedRequest(SOL, { messages: HISTORY })
    const declared = judgeReplayDeclaration(
      { recipient: SOL.route.recipient, model: SOL.route.model, replay: SOL.replay.declaration },
      0,
    )
    if (!('ok' in declared)) throw new Error('declaration')
    const projection = projectReplay({
      messages: request.messages,
      declaration: declared.ok,
      formats: new Set(SOL.replay.formats.accepts),
      off: false,
      resent: new Set(),
    })
    const [openai, anthropic] = request.messages.filter(item => item.role === 'assistant')
    expect(projection.diagnostics).toEqual([
      { message: anthropic?.id, scope: ANTHROPIC_SCOPE, format: 'anthropic-claude-v1', omittedParts: 1 },
    ])
    expect(projection.treatments).toEqual([
      { index: 1, message: openai?.id, continuable: true, carry: [1], thinking: 'native' },
      { index: 3, message: anthropic?.id, continuable: false, omit: [2], thinking: 'omit' },
    ])
  })
})
