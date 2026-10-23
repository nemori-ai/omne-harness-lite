// Cross-family replay, Anthropic side (spec D7, #465 C4): histories built as pure data hold
// assistant messages that an OpenAI model produced. Encoding for an Anthropic record leaves their
// reasoning out and omits their thinking, encode reports each as a `replay-omitted` diagnostic,
// and the Anthropic group of the same history goes back. After a foreign tool turn every Anthropic
// record keeps the requested effort: by the project convention no record turns reasoning off. The
// OpenAI family is not imported.
import { describe, expect, it } from 'vitest'
import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import { judgeReplayDeclaration, projectReplay, type Parameter } from '@omne-harness/model-contract'
import { recordAdoption } from '@omne-harness/pi-ai-transport'
import { ANTHROPIC_OWNER, type AnthropicRecord } from '@omne-harness/pi-ai-anthropic'
import {
  assembledOf,
  bindingOf,
  callBlock,
  declarationOf,
  encodeInput,
  fixedRequest,
  message,
  officialProfile,
  recordNamed,
  resultBlock,
  SOURCE,
  stateBlock,
  supplierOf,
  textBlock,
  thinkingBlock,
  tool,
  type RequestParts,
} from './support/anthropic.ts'

const SONNET = recordNamed('anthropic/claude-sonnet-5')
const OPUS_55 = recordNamed('anthropic/claude-opus-5.5')
const FABLE = recordNamed('anthropic/claude-fable-5.1')

const OPENAI_SCOPE = 'openrouter/openai/gpt-5.6-sol'
const OPENAI_FORMAT = 'openai-responses-v1'
const OPENAI_PAYLOAD =
  '{"data":"openai-cipher","format":"openai-responses-v1","id":"rs_1","type":"reasoning.encrypted"}'
const FORMAT = 'anthropic-claude-v1'
const ITEM = {
  format: FORMAT,
  index: 0,
  signature: 'claude-signature',
  text: 'claude thinking',
  type: 'reasoning.text',
}
const CLAUDE_PAYLOAD = JSON.stringify([ITEM])

function ownReplay(record: AnthropicRecord, at: readonly number[]): object {
  return { replay: { scope: `openrouter/${record.name}`, format: FORMAT, at } }
}

const OPENAI_REPLAY = { replay: { scope: OPENAI_SCOPE, format: OPENAI_FORMAT, at: [2] } }

/** OpenAI, then this record, then a new question: the history of the second Anthropic turn. */
function history(record: AnthropicRecord): readonly unknown[] {
  return [
    message('u1', 'user', [textBlock('b1', 'first question')]),
    message(
      'a1',
      'assistant',
      [
        thinkingBlock('k1', 'openai private summary'),
        textBlock('t1', 'openai answer'),
        stateBlock('s1', OPENAI_PAYLOAD, ['k1']),
      ],
      OPENAI_REPLAY,
    ),
    message('u2', 'user', [textBlock('b2', 'second question')]),
    message(
      'a2',
      'assistant',
      [
        thinkingBlock('k2', 'claude thinking'),
        textBlock('t2', 'claude answer'),
        stateBlock('s2', CLAUDE_PAYLOAD, ['k2']),
      ],
      ownReplay(record, [2]),
    ),
    message('u3', 'user', [textBlock('b3', 'third question')]),
  ]
}

/** The wire messages of a body. */
function messagesOf(body: JsonValue): readonly unknown[] {
  const parsed: unknown = JSON.parse(writeJsonText(body))
  const messages: unknown =
    typeof parsed === 'object' && parsed !== null ? Reflect.get(parsed, 'messages') : undefined
  if (!Array.isArray(messages)) throw new Error('the body has no messages')
  return messages
}

async function encoded(record: AnthropicRecord, parts: RequestParts) {
  const binding = await bindingOf(record)
  const request = fixedRequest(record, parts)
  const result = binding.encode(encodeInput(request))
  await binding.release()
  return { request, result }
}

describe('an OpenAI message in an Anthropic request', () => {
  it('leaves the foreign state and thinking out and carries the Anthropic group', async () => {
    const { request, result } = await encoded(SONNET, { messages: history(SONNET) })
    if (!('ok' in result)) throw new Error(JSON.stringify(result.failure))
    const body: unknown = JSON.parse(writeJsonText(result.ok.body))
    expect(body).toMatchObject({
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'first question' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'openai answer' }] },
        { role: 'user', content: [{ type: 'text', text: 'second question' }] },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'claude answer' }],
          reasoning_details: [ITEM],
        },
        { role: 'user', content: [{ type: 'text', text: 'third question' }] },
      ],
    })
    const [openai] = request.messages.filter(item => item.role === 'assistant')
    expect(result.ok.diagnostics).toEqual([
      {
        kind: 'replay-omitted',
        message: openai?.id,
        scope: OPENAI_SCOPE,
        format: OPENAI_FORMAT,
        omittedParts: 1,
      },
    ])
    const text = writeJsonText(result.ok.body)
    expect(text).not.toContain('openai-cipher')
    expect(text).not.toContain('openai private summary')
    expect(JSON.stringify(body)).not.toContain('"reasoning":{')
  })

  it('the replay projection of the record names the foreign message in its diagnostics', () => {
    const request = fixedRequest(SONNET, { messages: history(SONNET) })
    const declared = judgeReplayDeclaration(
      {
        recipient: SONNET.route.recipient,
        model: SONNET.route.model,
        replay: SONNET.replay.declaration,
      },
      0,
    )
    if (!('ok' in declared)) throw new Error('declaration')
    const projection = projectReplay({
      messages: request.messages,
      declaration: declared.ok,
      formats: new Set(SONNET.replay.formats.accepts),
      off: false,
      resent: new Set(),
    })
    const [openai, anthropic] = request.messages.filter(item => item.role === 'assistant')
    expect(projection.treatments).toEqual([
      { index: 1, message: openai?.id, continuable: false, omit: [2], thinking: 'omit' },
      { index: 3, message: anthropic?.id, continuable: true, carry: [2], thinking: 'native' },
    ])
  })

  it('a group of another Anthropic model is foreign too: left out with a diagnostic', async () => {
    const messages = history(SONNET).map((item, index) =>
      index === 3
        ? message(
            'a2',
            'assistant',
            [textBlock('t2', 'claude answer'), stateBlock('s2', CLAUDE_PAYLOAD)],
            ownReplay(recordNamed('anthropic/claude-opus-5'), [1]),
          )
        : item,
    )
    const { result } = await encoded(SONNET, { messages })
    if (!('ok' in result)) throw new Error(JSON.stringify(result.failure))
    expect(writeJsonText(result.ok.body)).not.toContain('claude-signature')
    expect(result.ok.diagnostics.map(item => item.kind)).toEqual([
      'replay-omitted',
      'replay-omitted',
    ])
  })

  it('foreign thinking under the rule adapter has no signed form and is refused', async () => {
    const { result } = await encoded(SONNET, {
      messages: history(SONNET),
      declaration: { ...declarationOf(SONNET), foreignThinking: 'adapter' },
    })
    expect(result).toEqual({
      failure: {
        kind: 'unsupported',
        field: 'thinking',
        adapter: recordAdoption(ANTHROPIC_OWNER, SONNET),
      },
    })
  })

  it('foreign thinking under the rule text goes out as plain text and is metered, without its state', async () => {
    const { result } = await encoded(SONNET, {
      messages: history(SONNET),
      declaration: { ...declarationOf(SONNET), foreignThinking: 'text' },
    })
    if (!('ok' in result)) throw new Error(JSON.stringify(result.failure))
    const messages = messagesOf(result.ok.body)
    expect(messages[1]).toEqual({
      role: 'assistant',
      content: [
        { type: 'text', text: 'openai private summary' },
        { type: 'text', text: 'openai answer' },
      ],
    })
    expect(writeJsonText(result.ok.body)).not.toContain('openai-cipher')
    // The meter counts what goes out: the thinking text is in the token input.
    expect(writeJsonText(result.ok.representation.tokenInput)).toContain('openai private summary')
  })
})

describe('own history', () => {
  // Sealed anthropic-family-current.spec.ts:746-753 refused an unsigned group before sending. The
  // current rule does not write own thinking that has no signed form, so the conversation goes on.
  it('own thinking without a sealed group is not written, never sent unsigned, and the request goes on', async () => {
    const { result } = await encoded(SONNET, {
      messages: [
        message('u1', 'user', [textBlock('b1', 'Turn 1.')]),
        message(
          'a1',
          'assistant',
          [thinkingBlock('k1', 'unsigned'), textBlock('t1', 'Answer 1.')],
          ownReplay(SONNET, []),
        ),
        message('u2', 'user', [textBlock('b2', 'Turn 2.')]),
      ],
    })
    if (!('ok' in result)) throw new Error(JSON.stringify(result.failure))
    expect(messagesOf(result.ok.body)[1]).toEqual({
      role: 'assistant',
      content: [{ type: 'text', text: 'Answer 1.' }],
    })
    expect(writeJsonText(result.ok.body)).not.toContain('unsigned')
    expect(result.ok.diagnostics).toEqual([])
  })
})

// --- a foreign tool turn ----------------------------------------------------------------------

/** The last tool turn comes from the given scope; then the tool result and, unless open, a question. */
function toolTurn(
  scope: string,
  format: string,
  payload: string,
  open = false,
): readonly unknown[] {
  const turn = [
    message('u1', 'user', [textBlock('b1', 'look up x')]),
    message(
      'a1',
      'assistant',
      [thinkingBlock('k1', 'why'), callBlock('c1', 'call_1'), stateBlock('s1', payload, ['k1'])],
      { replay: { scope, format, at: [2] } },
    ),
    message('t1', 'tool', [resultBlock('r1', 'call_1'), textBlock('b2', 'found')]),
  ]
  return open ? turn : [...turn, message('u2', 'user', [textBlock('b3', 'and then?')])]
}

const HIGH: Parameter = { kind: 'reasoning-effort', value: 'high' }

async function planned(record: AnthropicRecord, messages: readonly unknown[]) {
  const binding = await bindingOf(record)
  const request = fixedRequest(record, { messages, tools: [tool('lookup')], parameters: [HIGH] })
  const outcome = binding.rules.plan({
    profile: officialProfile(record),
    supplier: supplierOf(record),
    assembled: assembledOf(request),
  })
  await binding.release()
  if (!('ok' in outcome)) throw new Error(JSON.stringify(outcome.failure))
  return outcome.ok
}

const RECORDS = [OPUS_55, recordNamed('anthropic/claude-opus-5'), SONNET, FABLE].map(
  record => [record.name, record] as const,
)

describe('a foreign tool turn', () => {
  // Live on 2026-10-22 the gateway took an unsigned foreign tool turn with reasoning on for all
  // four models, as the last turn and before a later question. By the project convention the
  // engine never turns reasoning off; claude-opus-5.5 and claude-fable-5.1 also refuse it live.
  it.each(
    RECORDS.flatMap(([name, record]) => [
      [name, 'a later question', record, false] as const,
      [name, 'an open tool loop', record, true] as const,
    ]),
  )(
    '%s keeps the requested effort after %s and only leaves the foreign state out',
    async (_name, _end, record, open) => {
      const foreign = toolTurn(OPENAI_SCOPE, OPENAI_FORMAT, OPENAI_PAYLOAD, open)
      const plan = await planned(record, foreign)
      expect(plan.parameters).toEqual([
        {
          supplier: recordAdoption(ANTHROPIC_OWNER, record),
          applied: HIGH,
          origin: { kind: 'explicit', requested: HIGH, source: SOURCE },
        },
      ])
      const { request, result } = await encoded(record, {
        messages: foreign,
        tools: [tool('lookup')],
        parameters: [HIGH],
        parameterAdoptions: plan.parameters,
      })
      if (!('ok' in result)) throw new Error(JSON.stringify(result.failure))
      const body: unknown = JSON.parse(writeJsonText(result.ok.body))
      expect(body).toMatchObject({ reasoning: { effort: 'high' } })
      expect(writeJsonText(result.ok.body)).not.toContain('"enabled"')
      expect(writeJsonText(result.ok.body)).not.toContain('openai-cipher')
      const [openai] = request.messages.filter(item => item.role === 'assistant')
      expect(result.ok.diagnostics).toEqual([
        {
          kind: 'replay-omitted',
          message: openai?.id,
          scope: OPENAI_SCOPE,
          format: OPENAI_FORMAT,
          omittedParts: 1,
        },
      ])
    },
  )

  it('an own continuable last tool turn carries its group on claude-opus-5.5', async () => {
    const own = toolTurn(`openrouter/${OPUS_55.name}`, FORMAT, CLAUDE_PAYLOAD)
    const plan = await planned(OPUS_55, own)
    expect(plan.parameters.map(item => item.applied)).toEqual([HIGH])
    const { result } = await encoded(OPUS_55, {
      messages: own,
      tools: [tool('lookup')],
      parameters: [HIGH],
    })
    if (!('ok' in result)) throw new Error(JSON.stringify(result.failure))
    expect(JSON.parse(writeJsonText(result.ok.body))).toMatchObject({
      reasoning: { effort: 'high' },
    })
    expect(messagesOf(result.ok.body)[1]).toMatchObject({
      role: 'assistant',
      reasoning_details: [ITEM],
    })
    expect(result.ok.diagnostics).toEqual([])
  })
})
