import { describe, expect, it } from 'vitest'
import { judgeMessage, type Message } from '@omne-harness/message'
import { lineageFor } from '../src/model-input.js'
import type { ProjectedMessage } from '../src/values.js'
import { callId, tenantOf, text } from './fixtures.js'

const access = { principal: 'p', tenant: tenantOf() }

function assistant(id: string, replay?: object): Extract<Message, { role: 'assistant' }> {
  const judged = judgeMessage({
    role: 'assistant',
    id: 'msg_' + id.padStart(22, 'a'),
    blocks: [
      text('answer', 'a' + id),
      ...(replay === undefined
        ? []
        : [
            {
              kind: 'reasoning_state',
              id: 'r' + id,
              visibility: { toHuman: false, toModel: true },
              payload: 'sealed',
              pairs: [],
            },
          ]),
    ],
    ...(replay === undefined ? {} : { replay }),
  })
  if ('rejected' in judged || judged.ok.role !== 'assistant') throw new Error('assistant fixture')
  return judged.ok
}

const mark = (call: string) => ({ scope: 's', format: 'f', at: [1], call })

function projected(
  message: Message,
  sourceCall?: ProjectedMessage['sourceCall'],
): ProjectedMessage {
  return {
    seq: '1' as never,
    entry: { record: 'r', revision: '1' } as never,
    prefixDigest: 'd',
    dropped: [],
    message,
    ...(sourceCall === undefined ? {} : { sourceCall }),
  } as ProjectedMessage
}

describe('lineageFor: the calls whose output the carried reasoning counts as', () => {
  it('takes the producing call from the replay mark when the history row names none', () => {
    const reply = assistant('1', mark(String(callId('producer'))))
    expect(lineageFor(access, [projected(reply)], [reply], null)).toEqual({
      sources: [{ message: reply.id, call: callId('producer') }],
    })
  })

  it('prefers the call the history row names over the replay mark', () => {
    const reply = assistant('2', mark(String(callId('marked'))))
    const row = projected(reply, { tenant: access.tenant, call: callId('row') } as never)
    expect(lineageFor(access, [row], [reply], null)).toEqual({
      sources: [{ message: reply.id, call: callId('row') }],
    })
  })

  it('names no source for a reply without either, or with a mark that is not a call', () => {
    const plain = assistant('3')
    const odd = assistant('4', mark('not-a-call'))
    expect(lineageFor(access, [projected(plain), projected(odd)], [plain, odd], null)).toEqual({})
  })

  it('leaves out a message the request no longer holds', () => {
    const reply = assistant('5', mark(String(callId('gone'))))
    expect(lineageFor(access, [projected(reply)], [], null)).toEqual({})
  })

  it('counts a reply the history names twice once, and refuses two calls for it', () => {
    const reply = assistant('6')
    const row = (call: string) =>
      projected(reply, { tenant: access.tenant, call: callId(call) } as never)
    expect(lineageFor(access, [row('same'), row('same')], [reply], null)).toEqual({
      sources: [{ message: reply.id, call: callId('same') }],
    })
    expect(lineageFor(access, [row('one'), row('other')], [reply], null)).toEqual({
      kind: 'invalid',
      field: 'history.sourceCall',
      reason: 'source-evidence-conflict',
    })
  })
})
