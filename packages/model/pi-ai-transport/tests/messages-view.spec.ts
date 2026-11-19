import { writeJsonText } from '@omne-harness/json-text'
import type { ReplayDeclaration } from '@omne-harness/model-contract'
import { describe, expect, it } from 'vitest'
import { bindMessages, type MessagesRecord } from '../src/messages/index.ts'
import { sealThinking } from '../src/messages/reasoning.ts'
import {
  FORMAT,
  LIMITS,
  SCOPE,
  callBlock,
  declarationOf,
  engineProbe,
  fixedRequest,
  imageBlock,
  message,
  resultBlock,
  stateBlock,
  supplierOf,
  testMeter,
  textBlock,
  thinkingBlock,
  tool,
  type EngineProbe,
  type RequestParts,
} from './support/chat-record.ts'
import { messagesRecord } from './support/messages-record.ts'

const RECORD = messagesRecord({
  replay: { declaration: {}, formats: { produces: FORMAT, accepts: [FORMAT] }, binding: 'none' },
})
const adapter = supplierOf(RECORD).adoption

function encode(
  parts: RequestParts,
  probe: EngineProbe = engineProbe(),
  record: MessagesRecord = RECORD,
) {
  const request = fixedRequest(record, parts)
  return bindMessages({
    record,
    supplier: supplierOf(record),
    meter: testMeter(record, probe),
    limits: LIMITS,
    release: async () => {},
  }).encode({
    request,
    media: [],
    declaration: parts.declaration ?? request.declarations[0],
    resent: [],
  })
}

function body(outcome: ReturnType<typeof encode>): Record<string, unknown> {
  if (!('ok' in outcome)) throw new Error(JSON.stringify(outcome.failure))
  return JSON.parse(writeJsonText(outcome.ok.body)) as Record<string, unknown>
}

const SIGNED = sealThinking([{ type: 'thinking', thinking: 'plan', signature: 'sig' }])
const hidden = (id: string, text: string) => textBlock(id, text, false)

describe('the view the meter reads', () => {
  it('has one turn per message the model sees: its role, its shown blocks and whether it carries reasoning', () => {
    const probe = engineProbe()
    body(
      encode(
        {
          system: [textBlock('s1', 'brief')],
          messages: [
            message('u1', 'user', [textBlock('b1', 'go'), hidden('b2', 'secret')]),
            message('u2', 'user', [hidden('b3', 'only hidden')]),
            message(
              'a1',
              'assistant',
              [thinkingBlock('k1', 'plan'), stateBlock('s1', SIGNED), callBlock('c1', 'call-1')],
              { replay: { scope: SCOPE, format: FORMAT, at: [1] } },
            ),
            message('r1', 'tool', [
              resultBlock('x1', 'call-1'),
              textBlock('x2', 'ok'),
              hidden('x3', 'h'),
            ]),
            message('a2', 'assistant', [textBlock('t1', 'done')]),
            message('u3', 'user', [textBlock('b4', 'next')]),
          ],
          tools: [tool('lookup')],
        },
        probe,
      ),
    )
    const [view] = probe.views
    expect(view?.instruction.map(block => block.id)).toEqual(['s1'])
    expect(
      view?.turns.map(turn => [
        turn.role,
        turn.blocks.map(block => block.id),
        turn.replay.kind,
        turn.replay.kind === 'details' ? turn.replay.details.length : 0,
      ]),
    ).toEqual([
      ['user', ['b1'], 'none', 0],
      ['assistant', ['c1'], 'details', 1],
      ['tool', ['x1', 'x2'], 'none', 0],
      ['assistant', ['t1'], 'none', 0],
      ['user', ['b4'], 'none', 0],
    ])
    expect(view?.tools.map(item => item.name)).toEqual(['lookup'])
    expect(view?.toolChoice).toBe('auto')
  })
})

describe('foreign thinking and carried state', () => {
  const foreign = (blocks: readonly unknown[]) =>
    message('a1', 'assistant', blocks, {
      replay: { scope: 'gateway/other', format: FORMAT, at: [] },
    })
  const follow = message('u2', 'user', [textBlock('b2', 'next')])

  it('writes foreign thinking as text when the request says text', () => {
    const declaration: ReplayDeclaration = { ...declarationOf(RECORD), foreignThinking: 'text' }
    const sent = body(
      encode({
        messages: [foreign([thinkingBlock('k1', 'pondering'), textBlock('t1', 'answer')]), follow],
        declaration,
      }),
    )
    expect((sent.messages as { content: unknown[] }[])[0]?.content).toEqual([
      { type: 'text', text: 'pondering' },
      { type: 'text', text: 'answer' },
    ])
  })

  it('leaves foreign thinking out when the request says omit, and refuses it when the request asks for the adapter', () => {
    const omitted = body(
      encode({
        messages: [foreign([thinkingBlock('k1', 'pondering'), textBlock('t1', 'answer')]), follow],
        declaration: { ...declarationOf(RECORD), foreignThinking: 'omit' },
      }),
    )
    expect((omitted.messages as { content: unknown[] }[])[0]?.content).toEqual([
      { type: 'text', text: 'answer' },
    ])
    expect(
      encode({
        messages: [foreign([thinkingBlock('k1', 'pondering'), textBlock('t1', 'answer')]), follow],
        declaration: { ...declarationOf(RECORD), foreignThinking: 'adapter' },
      }),
    ).toEqual({ failure: { kind: 'unsupported', field: '/messages/0', adapter } })
  })

  it('refuses a carried state whose payload this engine did not seal', () => {
    expect(
      encode({
        messages: [
          message('a1', 'assistant', [stateBlock('s1', 'not a payload'), textBlock('t1', 'x')], {
            replay: { scope: SCOPE, format: FORMAT, at: [0] },
          }),
          follow,
        ],
      }),
    ).toEqual({
      failure: { kind: 'invalid', field: 'reasoning_state', reason: 'payload-not-replayable' },
    })
  })
})

describe('the tool choice and the tool results', () => {
  it.each([
    ['none with tools', { toolChoice: 'none', tools: [tool('lookup')] }, { type: 'none' }],
    ['auto without tools', { toolChoice: 'auto' }, undefined],
    ['none without tools', { toolChoice: 'none' }, undefined],
  ])('writes %s', (_case, parts, json) => {
    expect(body(encode(parts as RequestParts)).tool_choice).toEqual(json)
  })

  it.each([['a forced call without tools', { toolChoice: 'required' }, 'no-tools']])(
    'refuses %s',
    (_case, parts, reason) => {
      const record = messagesRecord({
        ...RECORD,
        accepts: { forcedToolChoice: true, endsWithAssistant: false },
      })
      expect(encode(parts as RequestParts, engineProbe(), record)).toEqual({
        failure: { kind: 'invalid', field: 'toolChoice', reason },
      })
    },
  )

  it('refuses a tool result that answers no call and a call left without its result', () => {
    expect(
      encode({
        messages: [
          message('r1', 'tool', [resultBlock('x1', 'call-9')]),
          message('u1', 'user', [textBlock('b1', 'x')]),
        ],
      }),
    ).toEqual({
      failure: { kind: 'invalid', field: '/messages/0/blocks/0', reason: 'orphan-tool-result' },
    })
    expect(
      encode({
        messages: [
          message('a1', 'assistant', [callBlock('c1', 'call-1')]),
          message('u1', 'user', [textBlock('b1', 'x')]),
        ],
        tools: [tool('lookup')],
      }),
    ).toEqual({
      failure: { kind: 'invalid', field: '/messages/0/blocks/0', reason: 'orphan-tool-call' },
    })
  })

  it('writes the shown content of a tool result, images included, and leaves hidden content out', () => {
    const sent = body(
      encode({
        messages: [
          message('a1', 'assistant', [callBlock('c1', 'call-1')]),
          message('r1', 'tool', [
            resultBlock('x1', 'call-1'),
            hidden('x2', 'h'),
            textBlock('x3', 'ok'),
            imageBlock('x4'),
          ]),
          message('u1', 'user', [textBlock('b1', 'x')]),
        ],
        tools: [tool('lookup')],
      }),
    )
    expect((sent.messages as { content: unknown[] }[])[1]?.content).toEqual([
      {
        type: 'tool_result',
        tool_use_id: 'call-1',
        content: [
          { type: 'text', text: 'ok' },
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' },
          },
        ],
      },
    ])
  })
})
