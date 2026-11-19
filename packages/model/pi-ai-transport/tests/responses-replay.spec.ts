// C13: the phase and the order of the output items are kept as written and carried back as kept.
// A recorded reply is decoded, then sent back as history; its input items are its output items.
import { writeJsonText } from '@omne-harness/json-text'
import type { ModelBlock } from '@omne-harness/model-contract'
import { describe, expect, it } from 'vitest'
import type { PiFamilyBinding } from '../src/index.ts'
import { bindResponses } from '../src/responses/index.ts'
import {
  LIMITS,
  SCOPE,
  engineProbe,
  fixedRequest,
  message,
  resultBlock,
  supplierOf,
  testMeter,
  textBlock,
  tool,
} from './support/chat-record.ts'
import {
  ITEMS_FORMAT,
  outputOf,
  responsesFramesOf,
  responsesRecord,
} from './support/responses-record.ts'

const RECORD = responsesRecord()
const TOOLS = [tool('get_weather')]

function bind(): PiFamilyBinding {
  return bindResponses({
    record: RECORD,
    supplier: supplierOf(RECORD),
    meter: testMeter(RECORD, engineProbe()),
    limits: LIMITS,
    release: async () => {},
  })
}

const ASK = message('u1', 'user', [textBlock('b1', 'which is further north?')])

function decoded(fixture: string): readonly ModelBlock[] {
  const decoder = bind().createDecoder({
    request: fixedRequest(RECORD, { messages: [ASK], tools: TOOLS }),
    accounting: { place: 'gateway', costUnit: 'credit' },
  })
  const blocks: ModelBlock[] = []
  for (const frame of responsesFramesOf(fixture)) {
    const accepted = decoder.accept(frame)
    if (!('ok' in accepted)) throw new Error(`decode: ${accepted.failure.diagnostic}`)
    for (const fact of accepted.ok) if (fact.kind === 'block-seal') blocks.push(fact.block)
  }
  return blocks
}

function sentBack(blocks: readonly ModelBlock[]): readonly Readonly<Record<string, unknown>>[] {
  const state = blocks.findIndex(block => block.kind === 'reasoning_state')
  const call = blocks.find(block => block.kind === 'tool_call')
  if (call?.kind !== 'tool_call') throw new Error('the reply has no call')
  const request = fixedRequest(RECORD, {
    messages: [
      ASK,
      message('a1', 'assistant', blocks, {
        replay: { scope: SCOPE, format: ITEMS_FORMAT, at: [state] },
      }),
      message('r1', 'tool', [resultBlock('x1', call.callId), textBlock('x2', 'cloudy')]),
    ],
    tools: TOOLS,
  })
  const encoded = bind().encode({
    request,
    media: [],
    declaration: request.declarations[0],
    resent: [],
  })
  if (!('ok' in encoded)) throw new Error(`encode: ${JSON.stringify(encoded.failure)}`)
  const body = JSON.parse(writeJsonText(encoded.ok.body)) as { input: Record<string, unknown>[] }
  return body.input.slice(1, -1)
}

describe('a recorded reply goes back as the items it came as (C13)', () => {
  it.each(['reasoning-message-call.sse', 'reasoning-message-call-2.sse', 'message-call.sse'])(
    '%s',
    fixture => {
      const output = outputOf(fixture)
      const input = sentBack(decoded(fixture))
      expect(input.map(item => item.type)).toEqual(output.map(item => item.type))
      for (const [index, original] of output.entries()) {
        const back = input[index]
        switch (original.type) {
          case 'reasoning': {
            const { status: _status, ...kept } = original
            expect(back).toEqual(kept)
            continue
          }
          case 'message': {
            const text = (items: unknown) => (items as { text: string }[]).map(part => part.text)
            expect(back).toMatchObject({
              id: original.id,
              phase: original.phase,
              role: 'assistant',
            })
            expect(text(back?.content)).toEqual(text(original.content))
            continue
          }
          case 'function_call':
            expect(back).toMatchObject({
              id: original.id,
              call_id: original.call_id,
              name: original.name,
              arguments: original.arguments,
            })
            continue
          default:
            throw new Error(`an output item of type ${String(original.type)}`)
        }
      }
    },
  )
})
