import { describe, expect, it } from 'vitest'
import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import { type Parameter } from '@omne-harness/model-contract'
import { judgeReplayDeclaration, projectReplay } from '@omne-harness/model-contract/provider'
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
  prefixBefore,
  recordNamed,
  resultBlock,
  SOURCE,
  stateBlock,
  supplierOf,
  textBlock,
  thinkingBlock,
  thinkingPayload,
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
const FORMAT = 'anthropic-messages-v1'
const ITEM = { type: 'thinking', thinking: 'claude thinking', signature: 'claude-signature' }
const CLAUDE_PAYLOAD = thinkingPayload([ITEM])

function ownReplay(record: AnthropicRecord, at: readonly number[]): object {
  return { replay: { scope: `openrouter/${record.name}`, format: FORMAT, at } }
}

const OPENAI_REPLAY = { replay: { scope: OPENAI_SCOPE, format: OPENAI_FORMAT, at: [2] } }

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
          content: [ITEM, { type: 'text', text: 'claude answer' }],
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
        reason: 'scope',
      },
    ])
    const text = writeJsonText(result.ok.body)
    expect(text).not.toContain('openai-cipher')
    expect(text).not.toContain('openai private summary')
    expect(body).not.toHaveProperty('output_config')
  })

  it('the replay projection of the record names the foreign message in its diagnostics', () => {
    const request = fixedRequest(SONNET, { messages: history(SONNET) })
    const declared = judgeReplayDeclaration(
      {
        provider: SONNET.route.provider,
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
      system: request.system,
      tools: request.tools,
      binding: SONNET.replay.binding,
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
        field: '/messages/1',
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
    expect(writeJsonText(result.ok.representation.tokenInput)).toContain('openai private summary')
  })
})

describe('own history', () => {
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

  it('a group sealed in the retired format anthropic-claude-v1 is left out with a format diagnostic', async () => {
    const retired = JSON.stringify([
      {
        format: 'anthropic-claude-v1',
        index: 0,
        signature: 'retired-signature',
        text: 'retired thinking',
        type: 'reasoning.text',
      },
    ])
    const { request, result } = await encoded(SONNET, {
      messages: [
        message('u1', 'user', [textBlock('b1', 'Turn 1.')]),
        message(
          'a1',
          'assistant',
          [
            thinkingBlock('k1', 'retired thinking'),
            textBlock('t1', 'Answer 1.'),
            stateBlock('s1', retired, ['k1']),
          ],
          {
            replay: { scope: `openrouter/${SONNET.name}`, format: 'anthropic-claude-v1', at: [2] },
          },
        ),
        message('u2', 'user', [textBlock('b2', 'Turn 2.')]),
      ],
    })
    if (!('ok' in result)) throw new Error(JSON.stringify(result.failure))
    expect(messagesOf(result.ok.body)[1]).toEqual({
      role: 'assistant',
      content: [{ type: 'text', text: 'Answer 1.' }],
    })
    expect(writeJsonText(result.ok.body)).not.toContain('retired-signature')
    expect(result.ok.diagnostics).toEqual([
      {
        kind: 'replay-omitted',
        message: request.messages[1]?.id,
        scope: `openrouter/${SONNET.name}`,
        format: 'anthropic-claude-v1',
        omittedParts: 1,
        reason: 'format',
      },
    ])
  })
})

function toolTurn(
  scope: string,
  format: string,
  payload: string,
  open = false,
  prefix?: string,
): readonly unknown[] {
  const mark = { scope, format, at: [2] }
  const turn = [
    message('u1', 'user', [textBlock('b1', 'look up x')]),
    message(
      'a1',
      'assistant',
      [thinkingBlock('k1', 'why'), callBlock('c1', 'call_1'), stateBlock('s1', payload, ['k1'])],
      { replay: prefix === undefined ? mark : { ...mark, prefix } },
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
      expect(body).toMatchObject({ output_config: { effort: 'high' } })
      expect(body).toMatchObject({ thinking: { type: 'adaptive' } })
      expect(writeJsonText(result.ok.body)).not.toContain('"disabled"')
      expect(writeJsonText(result.ok.body)).not.toContain('openai-cipher')
      const [openai] = request.messages.filter(item => item.role === 'assistant')
      expect(result.ok.diagnostics).toEqual([
        {
          kind: 'replay-omitted',
          message: openai?.id,
          scope: OPENAI_SCOPE,
          format: OPENAI_FORMAT,
          omittedParts: 1,
          reason: 'scope',
        },
      ])
    },
  )

  it('an own continuable last tool turn carries its group on claude-opus-5.5, on the prefix it was produced on', async () => {
    const unmarked = toolTurn(`openrouter/${OPUS_55.name}`, FORMAT, CLAUDE_PAYLOAD)
    const prefix = prefixBefore(OPUS_55, { messages: unmarked, tools: [tool('lookup')] }, 1)
    const own = toolTurn(`openrouter/${OPUS_55.name}`, FORMAT, CLAUDE_PAYLOAD, false, prefix)
    const plan = await planned(OPUS_55, own)
    expect(plan.parameters.map(item => item.applied)).toEqual([HIGH])
    const { result } = await encoded(OPUS_55, {
      messages: own,
      tools: [tool('lookup')],
      parameters: [HIGH],
    })
    if (!('ok' in result)) throw new Error(JSON.stringify(result.failure))
    expect(JSON.parse(writeJsonText(result.ok.body))).toMatchObject({
      output_config: { effort: 'high' },
    })
    expect(messagesOf(result.ok.body)[1]).toMatchObject({
      role: 'assistant',
      content: [ITEM, { type: 'tool_use', name: 'lookup' }],
    })
    expect(result.ok.diagnostics).toEqual([])
  })

  it('the same group without the prefix it was produced on is left out on claude-opus-5.5', async () => {
    const { request, result } = await encoded(OPUS_55, {
      messages: toolTurn(`openrouter/${OPUS_55.name}`, FORMAT, CLAUDE_PAYLOAD),
      tools: [tool('lookup')],
      parameters: [HIGH],
    })
    if (!('ok' in result)) throw new Error(JSON.stringify(result.failure))
    expect(writeJsonText(result.ok.body)).not.toContain('claude-signature')
    expect(result.ok.diagnostics).toEqual([
      {
        kind: 'replay-omitted',
        message: request.messages[1]?.id,
        scope: `openrouter/${OPUS_55.name}`,
        format: FORMAT,
        omittedParts: 1,
        reason: 'no-prefix',
      },
    ])
  })
})
